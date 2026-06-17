/**
 * 清理残留的旧 inferPartsByKeywords 代码
 */
const fs = require('fs');
const fp = 'D:/my-ai-Project/app/api/decompose/preview/route.ts';
let c = fs.readFileSync(fp, 'utf-8');

// 找到残留的 "> {" （旧函数签名被替换后的残留）
// 新函数以 "return result;\n}" 结束
// 紧跟着 "> {" 是旧函数的残留

// 策略：找到 "> {" 残留，删掉从它开始到下一个函数定义之间的所有内容
const residual = c.indexOf('> {\n  const result: Array<');
if (residual === -1) {
  console.log('未找到残留代码，尝试其他模式...');
  // 尝试找 "> {" 后面跟 allText
  const alt = c.indexOf('> {\n  const result:');
  if (alt !== -1) {
    console.log('找到替代模式 at', alt);
  }
} else {
  console.log('找到残留代码 at position', residual);
  
  // 找到下一个有效函数定义（inferByPosition 或 detectAllParts）
  const nextFunc = c.indexOf('\nfunction inferByPosition(');
  if (nextFunc === -1) {
    console.log('ERROR: 未找到 inferByPosition');
    process.exit(1);
  }
  
  // 删除从 residual 到 nextFunc 之间的内容
  const before = c.substring(0, residual);
  const after = c.substring(nextFunc);
  c = before + '\n' + after;
  
  fs.writeFileSync(fp, c, 'utf-8');
  console.log('清理完成');
}

// 验证
const verify = fs.readFileSync(fp, 'utf-8');
console.log('文件行数:', verify.split('\n').length);
console.log('inferPartsByKeywords 出现次数:', (verify.match(/function inferPartsByKeywords/g) || []).length);
console.log('inferByPosition 出现次数:', (verify.match(/function inferByPosition/g) || []).length);
console.log('detectAllParts 出现次数:', (verify.match(/function detectAllParts/g) || []).length);
console.log('contextualFixPartNumber 定义:', verify.includes('function contextualFixPartNumber'));
console.log('parseOcrCorruptExtended 定义:', verify.includes('function parseOcrCorruptExtended'));
