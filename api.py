import os
import shutil
import tempfile
from pathlib import Path

import cv2
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from main import dct_embed, dct_extract, lsb_embed, lsb_extract, text_to_bits


app = FastAPI(title="StegoLab API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPPORTED_METHODS = {"lsb", "dct"}
HEADER_BITS = 32


def normalize_method(method: str) -> str:
    method = method.lower().strip()
    if method not in SUPPORTED_METHODS:
        raise HTTPException(status_code=400, detail="Неподдерживаемый метод. Используйте LSB или DCT.")
    return method


async def save_upload(upload: UploadFile, directory: str) -> str:
    suffix = Path(upload.filename or "upload.png").suffix or ".png"
    path = os.path.join(directory, f"input{suffix}")
    content = await upload.read()

    if not content:
        raise HTTPException(status_code=400, detail="Загруженный файл пустой.")

    with open(path, "wb") as file:
        file.write(content)

    return path


def read_image(path: str):
    image = cv2.imread(path, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Не удалось прочитать изображение. Загрузите PNG, JPG, BMP или WEBP.")
    return image


def capacity_for(image, method: str) -> int:
    if method == "lsb":
        return max(int(image.size) - HEADER_BITS, 0)

    height, width = image.shape[:2]
    return max((height // 8) * (width // 8) - HEADER_BITS, 0)


def image_meta(image, method: str, message: str = "") -> dict:
    height, width = image.shape[:2]
    message_bits = len(text_to_bits(message)) if message else 0
    capacity_bits = capacity_for(image, method)

    return {
        "method": method,
        "width": width,
        "height": height,
        "capacity_bits": capacity_bits,
        "message_bits": message_bits,
        "status": "ready",
    }


def convert_to_png(source_path: str, target_path: str) -> None:
    image = read_image(source_path)
    if not cv2.imwrite(target_path, image):
        raise HTTPException(status_code=500, detail="Не удалось подготовить выходное изображение.")


def controlled_error(exc: Exception) -> HTTPException:
    message = str(exc) or "Обработка изображения не выполнена."
    translations = {
        "Message is too large for this image": "Сообщение слишком большое для этого изображения.",
        "Image processing failed.": "Обработка изображения не выполнена.",
    }
    message = translations.get(message, message)
    return HTTPException(status_code=400, detail=message)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/analyze")
async def analyze_image(
    image: UploadFile = File(...),
    method: str = Form("lsb"),
):
    method = normalize_method(method)

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = await save_upload(image, tmpdir)
        decoded = read_image(input_path)
        meta = image_meta(decoded, method)
        meta["status"] = "Изображение успешно проанализировано."
        return meta


@app.post("/api/extract")
async def extract_message(
    image: UploadFile = File(...),
    method: str = Form(...),
):
    method = normalize_method(method)

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = await save_upload(image, tmpdir)
        decoded = read_image(input_path)
        meta = image_meta(decoded, method)

        try:
            message = lsb_extract(input_path) if method == "lsb" else dct_extract(input_path)
        except Exception as exc:
            raise controlled_error(exc) from exc

        meta.update(
            {
                "message": message,
                "message_bits": len(text_to_bits(message)),
                "status": "Сообщение успешно извлечено.",
            }
        )
        return meta


@app.post("/api/embed")
async def embed_message(
    image: UploadFile = File(...),
    method: str = Form(...),
    message: str = Form(...),
):
    method = normalize_method(method)

    tmpdir = tempfile.mkdtemp()
    input_path = await save_upload(image, tmpdir)
    decoded = read_image(input_path)
    meta = image_meta(decoded, method, message)

    if not message:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Секретное сообщение не может быть пустым.")

    if meta["message_bits"] > meta["capacity_bits"]:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Сообщение слишком большое для этого изображения.")

    raw_output = os.path.join(tmpdir, "stego_raw.png")
    output_path = os.path.join(tmpdir, "stegolab-output.png")

    try:
        if method == "lsb":
            lsb_embed(input_path, raw_output, message)
        else:
            dct_embed(input_path, raw_output, message)
        convert_to_png(raw_output, output_path)
    except Exception as exc:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise controlled_error(exc) from exc

    headers = {
        "X-Stego-Method": method,
        "X-Stego-Width": str(meta["width"]),
        "X-Stego-Height": str(meta["height"]),
        "X-Stego-Capacity-Bits": str(meta["capacity_bits"]),
        "X-Stego-Message-Bits": str(meta["message_bits"]),
        "X-Stego-Status": "embedded",
        "Access-Control-Expose-Headers": (
            "X-Stego-Method, X-Stego-Width, X-Stego-Height, "
            "X-Stego-Capacity-Bits, X-Stego-Message-Bits, X-Stego-Status"
        ),
    }

    return FileResponse(
        output_path,
        media_type="image/png",
        filename="stegolab-output.png",
        headers=headers,
        background=BackgroundTask(shutil.rmtree, tmpdir, ignore_errors=True),
    )
