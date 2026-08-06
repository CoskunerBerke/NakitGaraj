chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract_listings') {
    const listings = [];
    const rows = document.querySelectorAll('tr.searchResultsItem');

    rows.forEach((row) => {
      try {
        const titleCell = row.querySelector('td.searchResultsTitleValue a');
        const yearCell = row.querySelector('td.searchResultsAttributeValue:nth-of-type(1)');
        const kmCell = row.querySelector('td.searchResultsAttributeValue:nth-of-type(2)');
        const colorCell = row.querySelector('td.searchResultsAttributeValue:nth-of-type(3)');
        const priceCell = row.querySelector('td.searchResultsPriceValue');
        const locationCell = row.querySelector('td.searchResultsLocationValue');

        if (!priceCell || !yearCell || !kmCell) return;

        const title = titleCell?.textContent?.trim() || '';
        const year = parseInt(yearCell.textContent?.trim().replace(/\D/g, '') || '0', 10);
        const mileageKm = parseInt(kmCell.textContent?.trim().replace(/\D/g, '') || '0', 10);
        const price = parseInt(priceCell.textContent?.trim().replace(/\D/g, '') || '0', 10);

        const locationText = locationCell?.textContent?.trim().replace(/\s+/g, ' ') || '';
        const parts = locationText.split('/');
        const city = parts[0]?.trim() || 'İstanbul';
        const district = parts[1]?.trim() || '';
        const color = colorCell?.textContent?.trim() || '';

        let make = 'Audi';
        let model = 'A4';
        let variant = '40 TDI';
        let trim = 'Quattro Advanced';

        const upperTitle = title.toUpperCase();
        if (upperTitle.includes('A6')) model = 'A6';
        else if (upperTitle.includes('A4')) model = 'A4';
        else if (upperTitle.includes('A3')) model = 'A3';
        else if (upperTitle.includes('A1')) model = 'A1';

        if (upperTitle.includes('45 TFSI')) variant = '45 TFSI';
        else if (upperTitle.includes('40 TDI')) variant = '40 TDI';
        else if (upperTitle.includes('35 TFSI')) variant = '35 TFSI';
        else if (upperTitle.includes('1.6 TDI')) variant = '1.6 TDI';
        else if (upperTitle.includes('1.4 TFSI')) variant = '1.4 TFSI';
        else if (upperTitle.includes('1.6')) variant = '1.6';

        if (upperTitle.includes('S LINE') || upperTitle.includes('S-LINE')) trim = 'Quattro S Line';
        else if (upperTitle.includes('DESIGN')) trim = 'Quattro Design';
        else if (upperTitle.includes('ADVANCED')) trim = 'Quattro Advanced';

        if (price > 100000 && year > 1990) {
          listings.push({ make, model, variant, trim, year, mileageKm, price, city, district, title, color });
        }
      } catch (e) {}
    });

    // Send to backend API
    fetch('http://localhost:3000/api/listings/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(listings)
    }).catch(err => console.log('Local backend call:', err));

    sendResponse({ listings });
  }
  return true;
});
