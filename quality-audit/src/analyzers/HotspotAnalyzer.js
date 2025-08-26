export class HotspotAnalyzer {
  async analyze(filePath, content) {
    const findings = [];
    const lines = content.split('\n');
    const lineCount = lines.length;
    
    const complexity = this.calculateComplexity(content);
    const functionCount = this.countPublicFunctions(content);
    
    if (lineCount >= 300 || complexity >= 15 || functionCount >= 8) {
      const isTestFile = filePath.includes('.test.') || filePath.includes('.spec.');
      
      let severity = 'LOW';
      let riskScore = 30;
      
      if (lineCount >= 500 || complexity >= 20) {
        severity = 'HIGH';
        riskScore = 70;
      } else if (lineCount >= 300 || complexity >= 15) {
        severity = 'MEDIUM';
        riskScore = 50;
      }
      
      if (isTestFile) {
        riskScore = Math.max(10, riskScore - 20);
      }
      
      findings.push({
        severity,
        file: filePath,
        type: 'hotspot',
        message: `Classless hotspot: ${lineCount} lines, complexity ${complexity}, ${functionCount} functions`,
        suggestion: 'Split into smaller modules or add class structure',
        riskScore
      });
    }
    
    return findings;
  }

  calculateComplexity(content) {
    let complexity = 1;
    
    const patterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\belse\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bdo\b/g,
      /\bswitch\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\?\s*[^:]+\s*:/g,
      /&&/g,
      /\|\|/g
    ];
    
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    });
    
    return complexity;
  }

  countPublicFunctions(content) {
    let count = 0;
    
    const functionPatterns = [
      /^\s*(?:export\s+)?(?:async\s+)?function\s+\w+/gm,
      /^\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/gm,
      /^\s*(?:export\s+)?class\s+\w+/gm,
      /^\s*module\.exports\.\w+\s*=/gm,
      /^\s*exports\.\w+\s*=/gm
    ];
    
    functionPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        count += matches.length;
      }
    });
    
    return count;
  }
}