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
    // 找 Part 数量为 1 的 Question 文件
    var onePart = j.data.filter(function(p) {
      return p.totalPartsDetected === 1 && p.fileType === 'Question' && p.status !== 'exists';
    });
    console.log('=== Part=1 的 Question 文件 (前5个) ===');
    onePart.slice(0, 5).forEach(function(f) {
      console.log(f.sourceFilename + ' | ' + f.examType + ' | ' + f.blocks[0].partName);
      console.log('  Preview: ' + f.blocks[0].preview.substring(0, 120));
    });
    
    // 找 Part=0 的文件
    var zeroPart = j.data.filter(function(p) { return p.totalPartsDetected === 0; });
    console.log('\n=== Part=0 的文件 ===');
    zeroPart.forEach(function(f) {
      console.log(f.sourceFilename + ' | ' + f.examType + '/' + f.fileType);
    });
  });
});
req.write(data);
req.end();
