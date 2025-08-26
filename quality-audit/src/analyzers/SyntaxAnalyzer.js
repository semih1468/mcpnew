import * as acorn from 'acorn';
import * as babelParser from '@babel/parser';
import path from 'path';

export class SyntaxAnalyzer {
  async analyze(filePath, content) {
    const findings = [];
    const ext = path.extname(filePath).toLowerCase();

    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      findings.push(...this.analyzeJavaScript(filePath, content, ext));
    }

    findings.push(...this.findUnusedVariables(filePath, content));
    findings.push(...this.findUnreachableCode(filePath, content));
    findings.push(...this.findMissingImports(filePath, content));
    findings.push(...this.findShadowedVariables(filePath, content));

    return findings;
  }

  analyzeJavaScript(filePath, content, ext) {
    const findings = [];
    const isTypeScript = ext === '.ts' || ext === '.tsx';
    const isJSX = ext === '.jsx' || ext === '.tsx';

    try {
      if (isTypeScript) {
        babelParser.parse(content, {
          sourceType: 'module',
          plugins: ['typescript', isJSX && 'jsx'].filter(Boolean),
          errorRecovery: false
        });
      } else {
        acorn.parse(content, {
          ecmaVersion: 'latest',
          sourceType: 'module',
          allowReturnOutsideFunction: true,
          allowImportExportEverywhere: true
        });
      }
    } catch (error) {
      findings.push({
        severity: 'HIGH',
        file: filePath,
        line: error.loc?.line || 1,
        type: 'parse',
        message: `Syntax error: ${error.message}`,
        suggestion: 'Fix syntax error for code to run',
        riskScore: 85
      });
    }

    return findings;
  }

  findUnusedVariables(filePath, content) {
    const findings = [];
    const lines = content.split('\n');
    const declaredVars = new Map();
    const usedVars = new Set();

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      const varMatch = trimmed.match(/^\s*(?:const|let|var)\s+(\w+)/);
      if (varMatch && !varMatch[1].startsWith('_')) {
        declaredVars.set(varMatch[1], index + 1);
      }

      const funcMatch = trimmed.match(/^\s*function\s+(\w+)/);
      if (funcMatch) {
        declaredVars.set(funcMatch[1], index + 1);
      }

      const usagePattern = /\b(\w+)\b/g;
      let match;
      while ((match = usagePattern.exec(line)) !== null) {
        const word = match[1];
        const beforeMatch = line.substring(0, match.index);
        if (!beforeMatch.includes(`const ${word}`) && 
            !beforeMatch.includes(`let ${word}`) && 
            !beforeMatch.includes(`var ${word}`) &&
            !beforeMatch.includes(`function ${word}`)) {
          usedVars.add(word);
        }
      }
    });

    declaredVars.forEach((lineNum, varName) => {
      if (!usedVars.has(varName) && !varName.startsWith('_')) {
        const isTestFile = filePath.includes('.test.') || filePath.includes('.spec.');
        findings.push({
          severity: 'LOW',
          file: filePath,
          line: lineNum,
          type: 'unused',
          message: `Unused variable: ${varName}`,
          suggestion: `Remove or use '${varName}'`,
          riskScore: isTestFile ? 15 : 25
        });
      }
    });

    return findings;
  }

  findUnreachableCode(filePath, content) {
    const findings = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length - 1; i++) {
      const currentLine = lines[i].trim();
      const nextLine = lines[i + 1].trim();
      
      if (currentLine.startsWith('return') || 
          currentLine === 'break' || 
          currentLine === 'continue' ||
          currentLine.startsWith('throw')) {
        
        if (nextLine && 
            !nextLine.startsWith('}') && 
            !nextLine.startsWith('//') &&
            !nextLine.startsWith('/*') &&
            !nextLine.startsWith('case') &&
            !nextLine.startsWith('default')) {
          
          findings.push({
            severity: 'MEDIUM',
            file: filePath,
            line: i + 2,
            type: 'unreachable',
            message: 'Unreachable code detected',
            suggestion: 'Remove unreachable code',
            riskScore: 45
          });
        }
      }
    }

    return findings;
  }

  findMissingImports(filePath, content) {
    const findings = [];
    const importedModules = new Set();
    const usedModules = new Set();
    const lines = content.split('\n');
    
    const builtins = ['String', 'Number', 'Boolean', 'Array', 'Object', 
                      'Date', 'Math', 'JSON', 'Promise', 'Error', 'Map', 
                      'Set', 'WeakMap', 'WeakSet', 'Symbol', 'RegExp',
                      'Proxy', 'Reflect', 'console', 'process'];

    lines.forEach((line) => {
      const importMatch = line.match(/import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)(?:\s*,\s*{[^}]+})?\s+from/);
      if (importMatch) {
        const imported = importMatch[0]
          .replace(/import\s+/, '')
          .replace(/\s+from.*/, '')
          .replace(/[{}]/g, '')
          .split(',');
        
        imported.forEach(name => {
          const cleaned = name.trim().split(' as ')[0].trim();
          if (cleaned) importedModules.add(cleaned);
        });
      }

      const requireMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*require/);
      if (requireMatch) {
        importedModules.add(requireMatch[1]);
      }

      const usagePattern = /\b([A-Z]\w+)\b(?:\s*\(|\s*\.\w+|\s*\[)/g;
      let match;
      while ((match = usagePattern.exec(line)) !== null) {
        if (!line.includes('class ' + match[1]) && 
            !line.includes('function ' + match[1])) {
          usedModules.add(match[1]);
        }
      }
    });

    usedModules.forEach(module => {
      if (!importedModules.has(module) && !builtins.includes(module)) {
        findings.push({
          severity: 'MEDIUM',
          file: filePath,
          line: 1,
          type: 'import',
          message: `Missing import: ${module}`,
          suggestion: `Add import for '${module}'`,
          riskScore: 40
        });
      }
    });

    return findings;
  }

  findShadowedVariables(filePath, content) {
    const findings = [];
    const lines = content.split('\n');
    const scopes = [new Set()];
    let currentScope = 0;

    lines.forEach((line, index) => {
      if (line.includes('{')) {
        currentScope++;
        scopes[currentScope] = new Set();
      }

      const varMatch = line.match(/(?:const|let|var|function)\s+(\w+)/);
      if (varMatch) {
        const varName = varMatch[1];
        
        for (let i = currentScope - 1; i >= 0; i--) {
          if (scopes[i].has(varName)) {
            findings.push({
              severity: 'MEDIUM',
              file: filePath,
              line: index + 1,
              type: 'shadow',
              message: `Shadowed variable: ${varName}`,
              suggestion: `Rename to avoid shadowing`,
              riskScore: 35
            });
            break;
          }
        }
        
        scopes[currentScope].add(varName);
      }

      if (line.includes('}') && currentScope > 0) {
        delete scopes[currentScope];
        currentScope--;
      }
    });

    return findings;
  }
}