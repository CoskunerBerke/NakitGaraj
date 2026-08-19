import http from 'http';

function checkUrl(url: string): Promise<boolean> {
  return new Promise(resolve => {
    http.get(url, res => {
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    }).on('error', () => resolve(false));
  });
}

async function main() {
  const fe = await checkUrl('http://localhost:3000');
  const be3001 = await checkUrl('http://localhost:3001/api/brands');
  console.log({ frontend3000: fe, backend3001: be3001 });
}

main();
