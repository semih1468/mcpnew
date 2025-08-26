export class NullGuardAnalyzer {
  async analyze(filePath, content) {
    const findings = [];
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      const issues = this.checkLine(line, index + 1);
      issues.forEach(issue => {
        findings.push({
          ...issue,
          file: filePath
        });
      });
    });
    
    return findings;
  }

  checkLine(line, lineNumber) {
    const findings = [];
    
    const unsafePatterns = [
      {
        pattern: /(\w+)\.(\w+)\.(\w+)/g,
        message: 'Deep property access without null check',
        suggestion: 'Use optional chaining (?.) or add null checks'
      },
      {
        pattern: /(\w+)\[['"`]?\w+['"`]?\]\[['"`]?\w+['"`]?\]/g,
        message: 'Deep bracket access without null check',
        suggestion: 'Add null checks before accessing nested properties'
      },
      {
        pattern: /(\w+)\.length(?!\s*[><=!])/g,
        message: 'Length access without null check',
        suggestion: 'Check if variable exists before accessing length'
      },
      {
        pattern: /(\w+)\.map\(/g,
        message: 'Array method without null check',
        suggestion: 'Ensure array exists before calling map'
      },
      {
        pattern: /(\w+)\.filter\(/g,
        message: 'Array method without null check',
        suggestion: 'Ensure array exists before calling filter'
      },
      {
        pattern: /(\w+)\.reduce\(/g,
        message: 'Array method without null check',
        suggestion: 'Ensure array exists before calling reduce'
      },
      {
        pattern: /JSON\.parse\([^)]+\)/g,
        message: 'JSON.parse without try-catch',
        suggestion: 'Wrap JSON.parse in try-catch block'
      }
    ];
    
    unsafePatterns.forEach(({ pattern, message, suggestion }) => {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const variable = match[1];
        
        if (this.hasNullCheck(line, variable)) {
          continue;
        }
        
        if (this.isDefinedInLine(line, variable)) {
          continue;
        }
        
        findings.push({
          severity: 'MEDIUM',
          line: lineNumber,
          type: 'null_guard',
          message: `${message}: ${variable}`,
          suggestion,
          riskScore: 40
        });
      }
    });
    
    const arrayDestructuring = /const\s+\[([^\]]+)\]\s*=\s*([^;]+)/g;
    let match;
    while ((match = arrayDestructuring.exec(line)) !== null) {
      if (!line.includes('|| []') && !line.includes('?? []')) {
        findings.push({
          severity: 'LOW',
          line: lineNumber,
          type: 'null_guard',
          message: 'Array destructuring without default',
          suggestion: 'Add default empty array: = value || []',
          riskScore: 30
        });
      }
    }
    
    const objectDestructuring = /const\s+\{([^}]+)\}\s*=\s*([^;]+)/g;
    match = null;
    while ((match = objectDestructuring.exec(line)) !== null) {
      if (!line.includes('|| {}') && !line.includes('?? {}')) {
        findings.push({
          severity: 'LOW',
          line: lineNumber,
          type: 'null_guard',
          message: 'Object destructuring without default',
          suggestion: 'Add default empty object: = value || {}',
          riskScore: 30
        });
      }
    }
    
    return findings;
  }

  hasNullCheck(line, variable) {
    const checks = [
      `${variable} &&`,
      `${variable}?.`,
      `${variable} ||`,
      `${variable} ??`,
      `!${variable}`,
      `${variable} ?`,
      `typeof ${variable}`,
      `${variable} !=`,
      `${variable} ==`,
      `if (${variable}`,
      `if (!${variable}`,
      `${variable} !== null`,
      `${variable} !== undefined`,
      `${variable} != null`
    ];
    
    return checks.some(check => line.includes(check));
  }

  isDefinedInLine(line, variable) {
    const definitions = [
      `const ${variable} =`,
      `let ${variable} =`,
      `var ${variable} =`,
      `${variable} = new`,
      `${variable} = []`,
      `${variable} = {}`,
      `${variable} = ['`,
      `${variable} = {"`,
      `function ${variable}`,
      `class ${variable}`
    ];
    
    return definitions.some(def => line.includes(def));
  }
}