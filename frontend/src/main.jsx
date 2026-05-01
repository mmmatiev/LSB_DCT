import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowRight,
  Binary,
  Blocks,
  CheckCircle2,
  Clipboard,
  Download,
  FileImage,
  Github,
  Grid3X3,
  ImageUp,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import "./styles.css";

const METHODS = {
  lsb: {
    label: "LSB",
    name: "младший значащий бит",
    accent: "cyan",
    description: "Прячет данные в младших битах значений пикселей.",
  },
  dct: {
    label: "DCT",
    name: "дискретное косинусное преобразование",
    accent: "green",
    description: "Прячет данные в частотных коэффициентах блоков 8x8.",
  },
};

function formatBits(bits = 0) {
  if (bits > 8_000_000) return `${(bits / 8_000_000).toFixed(2)} MB`;
  if (bits > 8_000) return `${(bits / 8_000).toFixed(1)} KB`;
  return `${bits.toLocaleString("ru-RU")} бит`;
}

function formatFileSize(bytes = 0) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function getHeaderInt(headers, name) {
  const value = headers.get(name);
  return value ? Number(value) : 0;
}

function logLine(type, message) {
  return {
    id: `${Date.now()}-${Math.random()}`,
    time: new Date().toLocaleTimeString("ru-RU", { hour12: false }),
    type,
    message,
  };
}

function logTypeLabel(type) {
  return {
    info: "ИНФО",
    success: "УСПЕХ",
    error: "ОШИБКА",
  }[type] || type.toUpperCase();
}

function App() {
  const fileInputRef = useRef(null);
  const [method, setMethod] = useState(() => {
    const initialMethod = new URLSearchParams(window.location.search).get("method");
    return initialMethod === "dct" ? "dct" : "lsb";
  });
  const [mode, setMode] = useState("embed");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [outputUrl, setOutputUrl] = useState("");
  const [message, setMessage] = useState(
    "Это секретное сообщение.\nStegoLab делает стеганографию наглядной и удобной."
  );
  const [extracted, setExtracted] = useState("");
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [logs, setLogs] = useState([
    logLine("info", "StegoLab готов. Загрузите изображение, чтобы начать."),
  ]);

  const messageBits = useMemo(() => new TextEncoder().encode(message).length * 8, [message]);
  const capacity = meta?.capacity_bits ?? 0;
  const usedPercent = capacity ? Math.min(100, Math.round((messageBits / capacity) * 100)) : 0;
  const activeMethod = METHODS[method];
  const canProcess = Boolean(file) && !busy;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, [previewUrl, outputUrl]);

  useEffect(() => {
    if (file) analyze(file, method);
  }, [method]);

  function pushLog(type, messageText) {
    setLogs((current) => [logLine(type, messageText), ...current].slice(0, 6));
  }

  async function readError(response) {
    try {
      const data = await response.json();
      if (Array.isArray(data.detail)) return "Проверьте заполнение формы.";
      return data.detail || "Запрос не выполнен.";
    } catch {
      return "Запрос не выполнен.";
    }
  }

  async function analyze(nextFile, nextMethod = method) {
    const form = new FormData();
    form.append("image", nextFile);
    form.append("method", nextMethod);

    try {
      const response = await fetch("/api/analyze", { method: "POST", body: form });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setMeta(data);
      pushLog("info", `Ёмкость (${nextMethod.toUpperCase()}): ${formatBits(data.capacity_bits)}.`);
    } catch (error) {
      setMeta(null);
      pushLog("error", error.message);
    }
  }

  function selectFile(nextFile) {
    if (!nextFile) return;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);

    const url = URL.createObjectURL(nextFile);
    setFile(nextFile);
    setPreviewUrl(url);
    setOutputUrl("");
    setExtracted("");
    pushLog("info", `Изображение загружено: ${nextFile.name} (${formatFileSize(nextFile.size)}).`);
    analyze(nextFile, method);
  }

  async function embed() {
    if (!file || !message.trim()) {
      pushLog("error", "Сначала загрузите изображение и введите секретное сообщение.");
      return;
    }

    setBusy(true);
    const form = new FormData();
    form.append("image", file);
    form.append("method", method);
    form.append("message", message);

    try {
      const response = await fetch("/api/embed", { method: "POST", body: form });
      if (!response.ok) throw new Error(await readError(response));

      const blob = await response.blob();
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      setOutputUrl(URL.createObjectURL(blob));
      setMeta({
        method: response.headers.get("X-Stego-Method") || method,
        width: getHeaderInt(response.headers, "X-Stego-Width"),
        height: getHeaderInt(response.headers, "X-Stego-Height"),
        capacity_bits: getHeaderInt(response.headers, "X-Stego-Capacity-Bits"),
        message_bits: getHeaderInt(response.headers, "X-Stego-Message-Bits"),
        status: response.headers.get("X-Stego-Status") || "Сообщение успешно встроено.",
      });
      pushLog("success", `Сообщение успешно встроено методом ${method.toUpperCase()}.`);
    } catch (error) {
      pushLog("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function extract() {
    if (!file) {
      pushLog("error", "Сначала загрузите изображение со скрытым сообщением.");
      return;
    }

    setBusy(true);
    const form = new FormData();
    form.append("image", file);
    form.append("method", method);

    try {
      const response = await fetch("/api/extract", { method: "POST", body: form });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setExtracted(data.message);
      setMeta(data);
      pushLog("success", `Сообщение извлечено (${formatBits(data.message_bits)}).`);
    } catch (error) {
      pushLog("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  function downloadOutput() {
    if (!outputUrl) return;
    const anchor = document.createElement("a");
    anchor.href = outputUrl;
    anchor.download = `stegolab-${method}.png`;
    anchor.click();
    pushLog("info", "Стего-изображение скачано.");
  }

  function copyExtracted() {
    if (!extracted) return;
    navigator.clipboard.writeText(extracted);
    pushLog("info", "Извлечённое сообщение скопировано.");
  }

  function clearWorkspace() {
    setFile(null);
    setMeta(null);
    setExtracted("");
    setPreviewUrl("");
    setOutputUrl("");
    pushLog("info", "Рабочая область очищена.");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><LockKeyhole size={20} /></div>
          <span><b>Stego</b>Lab</span>
        </div>
        <div className="top-actions">
          <span className="header-link"><FileImage size={16} /> Справка</span>
          <span className="header-link"><Github size={16} /> GitHub</span>
          <span className="ready"><span /> Готово</span>
        </div>
      </header>

      <main className="shell">
        <aside className="sidebar">
          <section className="side-section">
            <p className="side-title">Метод</p>
            <div className="segmented">
              {Object.entries(METHODS).map(([key, item]) => (
                <button
                  key={key}
                  className={method === key ? "active" : ""}
                  onClick={() => setMethod(key)}
                >
                  {key === "lsb" ? <Binary size={17} /> : <Grid3X3 size={17} />}
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          <section className="side-section">
            <p className="side-title">Режим</p>
            <div className="segmented">
              <button className={mode === "embed" ? "active" : ""} onClick={() => setMode("embed")}>
                <UploadCloud size={17} /> Встроить
              </button>
              <button className={mode === "extract" ? "active" : ""} onClick={() => setMode("extract")}>
                <Download size={17} /> Извлечь
              </button>
            </div>
          </section>

          <section className="info-card">
            <p className="side-title">Как работает</p>
            <div className={`method-note ${activeMethod.accent}`}>
              <b>{activeMethod.label} ({activeMethod.name})</b>
              <span>{activeMethod.description}</span>
            </div>
          </section>

          <AlgorithmOptions method={method} />
        </aside>

        <section className="workspace">
          <div className="section-title">1. Входное изображение</div>
          <div className="input-grid">
            <button
              className={`dropzone ${dragging ? "dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                selectFile(event.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/bmp,image/webp"
                onChange={(event) => selectFile(event.target.files[0])}
              />
              <ImageUp size={52} />
              <b>Перетащите изображение сюда</b>
              <span>или выберите файл</span>
              <small>PNG, JPG, BMP, WEBP</small>
            </button>

            <div className="preview-card">
              <div className="file-row">
                <span>{file ? <CheckCircle2 size={16} /> : <ScanLine size={16} />}</span>
                <b>{file?.name || "Изображение не выбрано"}</b>
                {meta && <small>{meta.width} x {meta.height}</small>}
                {file && <button onClick={clearWorkspace}><Trash2 size={16} /></button>}
              </div>
              {previewUrl ? (
                <img src={previewUrl} alt="Предпросмотр входного изображения" />
              ) : (
                <div className="empty-preview"><Sparkles size={34} /> Предпросмотр появится здесь</div>
              )}
            </div>
          </div>

          <div className="section-title">2. Секретное сообщение</div>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Введите скрытый текст..."
          />

          <div className="capacity-row">
            <div className="capacity-label">
              <span>Ёмкость</span>
              <Activity size={15} />
            </div>
            <div className="meter"><span style={{ width: `${usedPercent}%` }} /></div>
            <strong>{usedPercent}%</strong>
          </div>
          <div className="capacity-sub">
            <span>Занято: {formatBits(messageBits)}</span>
            <span>Доступно: {formatBits(capacity)}</span>
          </div>

          <div className="action-grid">
            <button className="primary-action" disabled={!canProcess || mode !== "embed"} onClick={embed}>
              <ShieldCheck size={20} /> {busy && mode === "embed" ? "Встраиваю..." : "Встроить в изображение"}
            </button>
            <button className="secondary-action" disabled={!canProcess || mode !== "extract"} onClick={extract}>
              <Download size={20} /> {busy && mode === "extract" ? "Извлекаю..." : "Извлечь сообщение"}
            </button>
          </div>

          <div className="output-panel">
            <div className="section-title">4. Результат</div>
            <div className="comparison">
              <ImageTile title="Исходное изображение" src={previewUrl} label={file?.name || "входной файл"} />
              <ArrowRight className="compare-arrow" size={25} />
              <ImageTile title={`Стего-изображение (${activeMethod.label})`} src={outputUrl} label="stegolab-output.png" />
              <button className="download-card" disabled={!outputUrl} onClick={downloadOutput}>
                <Download size={30} />
                <b>Скачать стего-изображение</b>
                <span>PNG без потерь</span>
              </button>
            </div>
          </div>
        </section>

        <aside className="inspector">
          {method === "lsb" ? <BitPanel /> : <DctPanel />}
          <section className="extracted-panel">
            <div className="panel-heading">Извлечённое сообщение <span>(предпросмотр)</span></div>
            <div className="message-preview">
              {extracted || "Запустите извлечение, чтобы увидеть скрытое сообщение."}
            </div>
            <button className="copy-button" disabled={!extracted} onClick={copyExtracted}>
              <Clipboard size={17} /> Скопировать
            </button>
            <span className="bit-pill">{formatBits(extracted ? new TextEncoder().encode(extracted).length * 8 : 0)}</span>
          </section>
        </aside>
      </main>

      <footer className="logbar">
        <div className="log-title"><Blocks size={17} /> Журнал</div>
        <div className="log-list">
          {logs.map((item) => (
            <div className={`log-item ${item.type}`} key={item.id}>
              <span>[{item.time}]</span>
              <b>{logTypeLabel(item.type)}</b>
              <p>{item.message}</p>
            </div>
          ))}
        </div>
        <button onClick={() => setLogs([])}><Trash2 size={16} /> Очистить</button>
      </footer>
    </div>
  );
}

function ImageTile({ title, src, label }) {
  return (
    <div className="image-tile">
      <p>{title}</p>
      {src ? <img src={src} alt={title} /> : <div className="image-placeholder"><FileImage size={24} /></div>}
      <small>{label}</small>
    </div>
  );
}

function AlgorithmOptions({ method }) {
  if (method === "lsb") {
    return (
      <section className="info-card options">
        <p className="side-title">Поля LSB</p>
        <label>
          Цветовой канал
          <select>
            <option>RGB</option>
            <option>Синий канал</option>
          </select>
        </label>
        <label>
          Битовая плоскость
          <select>
            <option>1 (LSB)</option>
          </select>
        </label>
      </section>
    );
  }

  return (
    <section className="info-card options">
      <p className="side-title">Поля DCT</p>
      <label>
        Коэффициент
        <select>
          <option>[4, 3]</option>
        </select>
      </label>
      <label>
        Размер блока
        <select>
          <option>8 x 8</option>
        </select>
      </label>
      <label className="toggle-row">
        Зигзаг-порядок
        <input type="checkbox" defaultChecked />
      </label>
    </section>
  );
}

function BitPanel() {
  const rows = [
    ["R", "0", "1", "0", "0", "0", "0", "0", "1"],
    ["G", "1", "0", "0", "1", "0", "1", "0", "0"],
    ["B", "1", "1", "0", "0", "0", "0", "1", "1"],
  ];

  return (
    <section className="viz-panel">
      <div className="panel-heading">LSB-визуализация <span>Пиксель (120, 85)</span></div>
      <div className="rgb-chip" />
      {rows.map((row) => (
        <div className="bit-row" key={row[0]}>
          <b>{row[0]}</b>
          {row.slice(1).map((bit, index) => (
            <span className={index === 7 ? "modifiable" : ""} key={`${row[0]}-${index}`}>{bit}</span>
          ))}
        </div>
      ))}
      <div className="legend"><span /> Младший бит изменяется</div>
    </section>
  );
}

function DctPanel() {
  const cells = [
    -415, -27, -11, 6, 2, -2, 1, 0,
    -26, -9, 3, 2, -1, 1, 0, 0,
    -12, 2, 1, 0, 0, 0, 0, 0,
    -6, 1, 0, 0, 0, 0, 0, 0,
    -3, 0, 0, 0, 0, 0, 0, 0,
    -2, 0, 0, 0, 0, 0, 0, 0,
    -1, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
  ];

  return (
    <section className="viz-panel">
      <div className="panel-heading green-text">DCT-блок 8x8 <span>Верхний левый</span></div>
      <div className="dct-grid">
        {cells.map((cell, index) => (
          <span className={index === 19 || index === 20 ? "selected" : ""} key={`${cell}-${index}`}>
            {cell}
          </span>
        ))}
      </div>
      <div className="legend green"><span /> Выбранные коэффициенты</div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
