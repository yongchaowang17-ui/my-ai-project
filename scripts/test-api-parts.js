var http = require('http');
var data = JSON.stringify({});
var req = http.request({
  hostname: 'localhost', port: 3000,
  path: '/api/decompose/preview', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
}, function(res) {
  var body = '';
  res.on('data', function(d) { body += d; });
  res.on('end', function() {
    var j = JSON.parse(body);
    // 找 2016_12_S2_A_01.md
    var target = j.data.find(function(p) { return p.sourceFilename === '2016_12_S2_A_01.md' && p.examType === 'CET6'; });
    if (target) {
      console.log('Found:', target.sourceFilename);
      console.log('Status:', target.status);
      console.log('Parts detected:', target.totalPartsDetected);
      console.log('Blocks:', target.blocks.length);
      target.blocks.forEach(function(b) {
        console.log('  P' + b.partIndex + ' ' + b.partName + ' | ' + b.lineCount + ' lines | ' + b.filename);
      });
    } else {
      console.log('File not found in preview results');
    }
    
    // 统计所有文件的 Part 数量分布
    var partCounts = {};
    j.data.forEach(function(p) {
      var key = p.totalPartsDetected + ' parts';
      partCounts[key] = (partCounts[key] || 0) + 1;
    });
    console.log('\nPart count distribution:');
    Object.keys(partCounts).sort().forEach(function(k) {
      console.log('  ' + k + ': ' + partCounts[k] + ' files');
    });
  });
});
req.write(data);
req.end();
