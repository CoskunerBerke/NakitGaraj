/**
 * TASINABILIR GERCEK-MOD BASLATICI (npm script'leri icin).
 *
 * MARKET_REFRESH_ALLOW_REAL=1 bayragini ACIKCA ve BILEREK bu wrapper icinde
 * ayarlar (kullanicinin `npm run market:browser:*` ile istedigi kasitli
 * gercek-mod). Guvenlik guardini ZAYIFLATMAZ: varsayilan hala kapali; yalniz
 * bu iki komut icin ve yalnizca elle calistirildiginda acilir. Windows/Unix
 * fark etmeden calisir (cross-env bagimliligi gerektirmez).
 *
 * BYPASS/STEALTH/HESAP-ROTASYONU YOK — yalnizca gercek-modu acar ve CLI'a devreder.
 */
process.env.MARKET_REFRESH_ALLOW_REAL = '1';
require('ts-node').register({ transpileOnly: true });
// argv: [node, run-real.js, <command>, ...rest] -> CLI [node, cli, <command>, ...rest]
process.argv = [process.argv[0], require('path').join(__dirname, 'cli.ts'), ...process.argv.slice(2)];
require('./cli.ts');
