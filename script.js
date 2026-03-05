
let html5QrCode;
        let isScanning = true;
        let currentResult = '';
        let scanHistory = JSON.parse(localStorage.getItem('qrScanHistory') || '[]');

        // Initializes the QR code scanner and requests camera access.
        async function initScanner() {
            try {
                html5QrCode = new Html5Qrcode("reader");
                const devices = await Html5Qrcode.getCameras();

                if (devices && devices.length) {
                    // Prefer back camera
                    const backCamera = devices.find(device =>
                        device.label.toLowerCase().includes('back') ||
                        device.label.toLowerCase().includes('rear') ||
                        device.label.toLowerCase().includes('environment')
                    ) || devices[0];

                    await startScanning(backCamera.id);
                } else {
                    showPermissionDenied();
                }
            } catch (err) {
                console.error("Error initializing scanner:", err);
                showPermissionDenied();
            }
        }

        // Starts the QR code scanning process with the specified camera ID.
        async function startScanning(cameraId) {
            try {
                const config = {
                    fps: 10,
                    qrbox: { width: 200, height: 200 },
                    aspectRatio: 1.0,
                    videoConstraints: {
                        deviceId: { exact: cameraId },
                        facingMode: "environment"
                    }
                };

                await html5QrCode.start(
                    cameraId,
                    config,
                    onScanSuccess,
                    onScanFailure
                );

                isScanning = true;
                updateScanButton();

            } catch (err) {
                console.error("Error starting scanner:", err);
                // Try without exact deviceId constraint
                try {
                    await html5QrCode.start(
                        { facingMode: "environment" },
                        { fps: 10, qrbox: { width: 200, height: 200 } },
                        onScanSuccess,
                        onScanFailure
                    );
                    isScanning = true;
                    updateScanButton();
                } catch (err2) {
                    showPermissionDenied();
                }
            }
        }

        // Callback function executed when a QR code is successfully scanned.
        function onScanSuccess(decodedText, decodedResult) {
            if (decodedText !== currentResult) {
                currentResult = decodedText;

                // Vibrate device
                if (navigator.vibrate) {
                    navigator.vibrate([50, 100, 50]);
                }

                // Visual feedback
                const overlay = document.getElementById('scannerOverlay');
                overlay.classList.add('vibrate');
                setTimeout(() => overlay.classList.remove('vibrate'), 300);

                showResult(decodedText);
                addToHistory(decodedText);

                // Pause scanning briefly
                html5QrCode.pause();
                isScanning = false;
                updateScanButton();
            }
        }

        // Callback function executed when QR code scanning fails (ignored for continuous scanning).
        function onScanFailure(error) {
            // Ignore scan failures
        }

        // Pauses or resumes the QR code scanning process.
        function toggleScanning() {
            if (!html5QrCode) return;

            if (isScanning) {
                html5QrCode.pause();
                isScanning = false;
            } else {
                html5QrCode.resume();
                isScanning = true;
                currentResult = ''; // Reset to allow rescanning same code
            }
            updateScanButton();
        }

        // Updates the text of the scan/pause button.
        function updateScanButton() {
            const btnText = document.getElementById('scanBtnText');
            btnText.textContent = isScanning ? '⏸ Pause' : '▶ Resume';
        }

        // Displays the scanned QR code result in the result panel.
        function showResult(text) {
            document.getElementById('resultContent').textContent = text;
            document.getElementById('resultPanel').classList.add('active');
            document.getElementById('backdrop').classList.add('active');
        }

        // Closes the result panel and resumes scanning if paused.
        function closeResult() {
            document.getElementById('resultPanel').classList.remove('active');
            document.getElementById('backdrop').classList.remove('active');
            currentResult = '';
            if (!isScanning) {
                toggleScanning(); // Auto-resume
            }
        }

        // Copies the scanned result to the clipboard.
        function copyResult() {
            navigator.clipboard.writeText(currentResult).then(() => {
                showToast('✅ Copied!');
            }).catch(() => {
                // Fallback
                const textArea = document.createElement("textarea");
                textArea.value = currentResult;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showToast('✅ Copied!');
            });
        }

        // Attempts to open the scanned result as a URL.
        function openResult() {
            let url = currentResult.trim();
            // More robust URL validation regex based on RFC 3986 (simplified for common use-cases)
            const urlRegex = new RegExp('^(https?:\\/\\/)?' + // protocol
                                        '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.){1,}[a-z\\d-]{2,}|' + // domain name
                                        '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
                                        '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
                                        '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
                                        '(\\#[-a-z\\d_]*)?$', 'i'); // fragment locator

            if (!urlRegex.test(url)) {
                showToast('⚠️ Not a valid URL');
                return;
            }
            if (!url.match(/^https?:\\/\\//i)) {
                url = 'https://' + url;
            }
            window.open(url, '_blank');
        }

        // Shares the scanned result using the Web Share API or copies it.
        async function shareResult() {
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'Scanned QR Code',
                        text: currentResult
                    });
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        copyResult();
                    }
                }
            } else {
                copyResult();
            }
        }

        // Adds a scanned result to the local storage history.
        function addToHistory(text) {
            const item = {
                text: text,
                time: new Date().toISOString()
            };
            scanHistory.unshift(item);
            if (scanHistory.length > 50) scanHistory.pop();
            localStorage.setItem('qrScanHistory', JSON.stringify(scanHistory));
            updateHistoryCount();
        }

        // Updates the count displayed on the history badge.
        function updateHistoryCount() {
            const badge = document.getElementById('scanCount');
            const count = scanHistory.length;
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }

        // Toggles the visibility of the scan history panel.
        function toggleHistory() {
            const panel = document.getElementById('historyPanel');
            const backdrop = document.getElementById('backdrop');

            if (panel.classList.contains('active')) {
                panel.classList.remove('active');
                backdrop.classList.remove('active');
            } else {
                renderHistory();
                panel.classList.add('active');
                backdrop.classList.add('active');
            }
        }

        // Renders the scan history items in the history panel.
        function renderHistory() {
            const list = document.getElementById('historyList');
            if (scanHistory.length === 0) {
                list.innerHTML = '<div class="empty-state">No scans yet</div>';
                return;
            }

            list.innerHTML = scanHistory.map((item, index) => {
                const date = new Date(item.time);
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

                return `
                    <div class="history-item" onclick="loadFromHistory(${index})">
                        <div class="history-time">${dateStr} • ${timeStr}</div>
                        <div class="history-text">${item.text}</div>
                    </div>
                `;
            }).join('');
        }

        // Loads a previously scanned item from history into the result panel.
        function loadFromHistory(index) {
            currentResult = scanHistory[index].text;
            showResult(currentResult);
            toggleHistory();
        }

        // Clears all stored scan history.
        function clearHistory() {
            if (confirm('Clear all scan history?')) {
                scanHistory = [];
                localStorage.removeItem('qrScanHistory');
                renderHistory();
                updateHistoryCount();
            }
        }

        // Closes all overlay panels (result and history).
        function closeAllPanels() {
            document.getElementById('resultPanel').classList.remove('active');
            document.getElementById('historyPanel').classList.remove('active');
            document.getElementById('backdrop').classList.remove('active');
        }

        // Displays the camera permission denied message.
        function showPermissionDenied() {
            document.getElementById('permissionDenied').classList.add('show');
        }

        // Handles QR code scanning from an uploaded image file.
        async function handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            try {
                if (!html5QrCode) {
                    html5QrCode = new Html5Qrcode("reader");
                }

                // Stop camera if running
                if (isScanning) {
                    await html5QrCode.stop();
                }

                const result = await html5QrCode.scanFile(file, true);
                currentResult = result;
                showResult(result);
                addToHistory(result);

                // Restart camera
                await startScanning(devices[0].id);

            } catch (err) {
                showToast('❌ No QR code found');
                // Restart camera if it was stopped
                if (!isScanning) {
                    await startScanning(devices[0].id);
                }
            }

            // Reset input
            event.target.value = '';
        }

        // Displays a transient toast notification to the user.
        function showToast(message) {
            const existing = document.querySelector('.toast');
            if (existing) existing.remove();

            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = message;
            document.body.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 2000);
        }

        // Handle visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && html5QrCode && isScanning) {
                html5QrCode.pause();
            } else if (!document.hidden && html5QrCode && !document.getElementById('resultPanel').classList.contains('active')) {
                html5QrCode.resume();
            }
        });

        // Initialize
        window.addEventListener('load', initScanner);
        updateHistoryCount();

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}
