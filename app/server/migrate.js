require('./db').migrate().then(() => { console.log('Migraciones aplicadas'); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
