import cv2
import numpy as np


def text_to_bits(text):
    data = text.encode("utf-8")
    return "".join(f"{byte:08b}" for byte in data)


# print(text_to_bits('ab'))
# HSE_MIEM_IB_IBKS_GR№233_Матиев
def bits_to_text(bits):
    data = bytes(int(bits[i:i + 8], 2) for i in range(0, len(bits), 8))
    return data.decode("utf-8")


# print(bits_to_text('0110000101100010'))

def add_length(bits):
    length = f"{len(bits):032b}"
    return length + bits


# print(add_length(text_to_bits('a')))
# HSE_MIEM_IB_IBKS_GR№233_Матиев
def read_length(bits):
    return int(bits[:32], 2)


# print(read_length('0000000000000000000000000000100001100001'))

def lsb_embed(input_path, output_path, message):
    image = cv2.imread(input_path, cv2.IMREAD_COLOR)
    bits = add_length(text_to_bits(message))
    flat = image.reshape(-1)

    if len(bits) > len(flat):
        raise ValueError("Сообщение слишком длинное")

    for i, bit in enumerate(bits):
        flat[i] = (flat[i] & 254) | int(bit)

    cv2.imwrite(output_path, image)


def lsb_extract(image_path):
    image = cv2.imread(image_path, cv2.IMREAD_COLOR)
    flat = image.reshape(-1)

    length_bits = "".join(str(flat[i] & 1) for i in range(32))
    message_length = read_length(length_bits)

    message_bits = "".join(str(flat[i] & 1) for i in range(32, 32 + message_length))
    return bits_to_text(message_bits)


def dct_embed(input_path, output_path, message):
    image = cv2.imread(input_path, cv2.IMREAD_COLOR)
    channel = image[:, :, 0].astype(np.float32)
    bits = add_length(text_to_bits(message))

    height, width = channel.shape
    blocks_count = (height // 8) * (width // 8)

    if len(bits) > blocks_count:
        raise ValueError("Сообщение слишком длинное")

    bit_index = 0
    q = 10

    for y in range(0, height - height % 8, 8):
        for x in range(0, width - width % 8, 8):
            if bit_index >= len(bits):
                image[:, :, 0] = np.clip(channel, 0, 255).astype(np.uint8)
                cv2.imwrite(output_path, image)
                return

            block = channel[y:y + 8, x:x + 8]
            dct_block = cv2.dct(block)

            value = int(round(dct_block[4, 3] / q))
            value = (value & 254) | int(bits[bit_index])
            dct_block[4, 3] = value * q

            channel[y:y + 8, x:x + 8] = cv2.idct(dct_block)
            bit_index += 1

    image[:, :, 0] = np.clip(channel, 0, 255).astype(np.uint8)
    cv2.imwrite(output_path, image)


def dct_extract(image_path):
    image = cv2.imread(image_path, cv2.IMREAD_COLOR)
    channel = image[:, :, 0].astype(np.float32)
    height, width = channel.shape
    bits = []
    q = 10

    for y in range(0, height - height % 8, 8):
        for x in range(0, width - width % 8, 8):
            block = channel[y:y + 8, x:x + 8]
            dct_block = cv2.dct(block)
            value = int(round(dct_block[4, 3] / q))
            bits.append(str(value & 1))

    bits = "".join(bits)
    message_length = read_length(bits[:32])
    return bits_to_text(bits[32:32 + message_length])


# if __name__ == "__main__":
#     method = "lsb"
#     mode = "embed"
#
#     input_path = "input.bmp"
#     output_path = "output.bmp"
#     message = "hello"
#
#     if method == "lsb" and mode == "embed":
#         lsb_embed(input_path, output_path, message)
#
#     if method == "lsb" and mode == "extract":
#         print(lsb_extract(input_path))
#
#     if method == "dct" and mode == "embed":
#         dct_embed(input_path, output_path, message)
#
#     if method == "dct" and mode == "extract":
#         print(dct_extract(input_path))
