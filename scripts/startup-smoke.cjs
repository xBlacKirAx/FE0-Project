const http = require('http');
const path = require('path');

const { startServer, server } = require(path.join(__dirname, '..', 'server.js'));

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function requestJson(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                raw += chunk;
            });
            res.on('end', () => {
                resolve({ statusCode: res.statusCode || 0, body: raw });
            });
        });

        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.destroy(new Error(`请求超时: ${url}`));
        });
    });
}

async function closeServer() {
    await new Promise((resolve) => {
        server.close(() => resolve());
    });
}

async function main() {
    const host = '127.0.0.1';
    const started = startServer({ host, port: 0 });

    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('服务启动超时（5秒）')), 5000);
        started.once('listening', () => {
            clearTimeout(timer);
            resolve();
        });
        started.once('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });

    const address = started.address();
    const port = Number(address?.port || 0);
    assert(port > 0, '未获得有效监听端口');

    const rootRes = await requestJson(`http://${host}:${port}/`);
    assert(rootRes.statusCode === 200, `首页状态码异常: ${rootRes.statusCode}`);
    assert(rootRes.body.includes('<div id="app"'), '首页内容异常，缺少应用挂载节点');

    const cardsRes = await requestJson(`http://${host}:${port}/api/cards`);
    assert(cardsRes.statusCode === 200, `/api/cards 状态码异常: ${cardsRes.statusCode}`);
    const cards = JSON.parse(cardsRes.body);
    assert(Array.isArray(cards), '/api/cards 返回不是数组');
    assert(cards.length > 0, '/api/cards 返回空数组');

    console.log('启动烟测检查通过');
}

main()
    .catch((error) => {
        console.error(`启动烟测检查失败: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await closeServer();
        } catch {
            // ignore
        }
    });
