const http = require('http');
const postData = JSON.stringify({});
const req = http.request({
  hostname: 'localhost', port: 3000,
  path: '/api/decompose/preview', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const dist = {};
    json.data.forEach(f => { dist[f.totalPartsDetected] = (dist[f.totalPartsDetected] || 0) + 1; });
    console.log('========== API 检测分布 ==========');
    Object.entries(dist).sort((a, b) => a[0] - b[0]).forEach(([k, v]) => console.log(`  ${k} Parts: ${v}`));
    console.log('  总计:', json.data.length);

    // 检查特定 Part V 文件
    const p5files = json.data.filter(f => f.blocks.some(b => b.partIndex === 5));
    console.log('\n========== Part V 文件（应已映射为 Part 4）==========');
    console.log('  数量:', p5files.length);
    
    // 检查之前有问题的文件
    const targets = ['2024_12_S2_Q_01.md', '2024_12_S3_Q_01.md', 'CET6_2022.12_Set2_纯解析.md'];
    for (const t of targets) {
      const f = json.data.find(x => x.sourceFilename === t);
      if (f) {
        console.log(`\n=== ${t} (${f.totalPartsDetected} Parts) ===`);
        f.blocks.forEach(b => console.log(`  P${b.partIndex} ${b.partName} (${b.lineCount}行)`));
      }
    }
  });
});
req.write(postData);
req.end();
