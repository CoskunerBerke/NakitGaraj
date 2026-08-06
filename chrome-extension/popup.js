document.getElementById('importBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = 'Sayfa taranıyor...';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url.includes('sahibinden.com')) {
    statusDiv.textContent = '⚠️ Lütfen Sahibinden ilan veya arama sayfasındayken tıklayın.';
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action: 'extract_listings' }, (response) => {
    if (chrome.runtime.lastError) {
      statusDiv.textContent = '❌ Sayfa okunamadı. Lütfen sayfayı yenileyip tekrar deneyin.';
      return;
    }

    if (response && response.listings) {
      statusDiv.className = 'status success';
      statusDiv.textContent = `✅ ${response.listings.length} adet ilan başarıyla ayrıştırıldı ve NakitGaraj'a aktarıldı!`;
    } else {
      statusDiv.textContent = '⚠️ Sayfada ilan tablosu bulunamadı.';
    }
  });
});
