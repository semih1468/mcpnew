import path from 'path';

export class ReportGenerator {
  generate(results, totalFiles) {
    const allFindings = this.collectAllFindings(results);
    const top5 = this.getTop5Findings(allFindings);
    
    const report = [];
    
    report.push(this.generateSummary(results, totalFiles, top5));
    
    if (results.syntax.length > 0) {
      report.push(this.generateSyntaxSection(results.syntax));
    }
    
    if (results.duplicates.length > 0) {
      report.push(this.generateDuplicateSection(results.duplicates));
    }
    
    if (results.copyPaste.length > 0) {
      report.push(this.generateCopyPasteSection(results.copyPaste));
    }
    
    if (results.hotspots.length > 0) {
      report.push(this.generateHotspotSection(results.hotspots));
    }
    
    if (results.cohesion.length > 0) {
      report.push(this.generateCohesionSection(results.cohesion));
    }
    
    if (results.nullGuards.length > 0) {
      report.push(this.generateNullGuardSection(results.nullGuards));
    }
    
    report.push(this.generateFixPackage(results));
    report.push(this.generateMetrics(results));
    report.push(this.generateTop5(top5));
    
    return report.join('\n\n');
  }

  collectAllFindings(results) {
    const allFindings = [];
    
    Object.values(results).forEach(categoryFindings => {
      if (Array.isArray(categoryFindings)) {
        allFindings.push(...categoryFindings);
      }
    });
    
    return allFindings.sort((a, b) => b.riskScore - a.riskScore);
  }

  getTop5Findings(findings) {
    return findings.slice(0, 5);
  }

  generateSummary(results, totalFiles, top5) {
    const totalIssues = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
    const highSeverity = this.countBySeverity(results, 'HIGH');
    const mediumSeverity = this.countBySeverity(results, 'MEDIUM');
    const lowSeverity = this.countBySeverity(results, 'LOW');
    
    const criticalFiles = new Set();
    top5.forEach(finding => criticalFiles.add(finding.file));
    
    return `📊 ÖZET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Taranan: ${totalFiles} dosya | Toplam: ${totalIssues} bulgu
HIGH: ${highSeverity} | MEDIUM: ${mediumSeverity} | LOW: ${lowSeverity}
Kritik dosyalar: ${criticalFiles.size} adet
En yüksek risk: ${top5[0]?.type || 'N/A'} (Risk: ${top5[0]?.riskScore || 0})`;
  }

  generateSyntaxSection(findings) {
    const lines = ['🔍 SYNTAX'];
    
    findings.forEach(f => {
      lines.push(`- [${f.severity}] ${this.formatPath(f.file)}:${f.line} | Tür: ${f.type} | Risk: ${f.riskScore}`);
      lines.push(`  Link: ${this.generateVSCodeLink(f.file, f.line)}`);
      lines.push(`  Neden: ${f.message}`);
      lines.push(`  Öneri: ${f.suggestion}`);
    });
    
    return lines.join('\n');
  }

  generateDuplicateSection(findings) {
    const lines = ['🔄 BULGULAR\n1) Duplicate Function'];
    
    findings.forEach(f => {
      lines.push(`- [${f.severity}] ${this.formatPath(f.file)}:${f.line} ↔ ${this.formatPath(f.relatedFile)}:${f.relatedLine} | Risk: ${f.riskScore}`);
      lines.push(`  Link: ${this.generateVSCodeLink(f.file, f.line)}`);
      lines.push(`  Neden: ${f.message}`);
      lines.push(`  Öneri: ${f.suggestion}`);
    });
    
    return lines.join('\n');
  }

  generateCopyPasteSection(findings) {
    const lines = ['2) Copy-Paste'];
    
    findings.forEach(f => {
      const lineRange = f.endLine ? `${f.line}-${f.endLine}` : f.line;
      lines.push(`- [${f.severity}] ${this.formatPath(f.file)}:${lineRange} ≈ ${this.formatPath(f.relatedFile)}:${f.relatedLine} | Risk: ${f.riskScore}`);
      lines.push(`  Link: ${this.generateVSCodeLink(f.file, f.line)}`);
      lines.push(`  Öneri: ${f.suggestion}`);
    });
    
    return lines.join('\n');
  }

  generateHotspotSection(findings) {
    const lines = ['3) Classless Hotspot'];
    
    findings.forEach(f => {
      lines.push(`- [${f.severity}] ${this.formatPath(f.file)} | Risk: ${f.riskScore}`);
      lines.push(`  Link: ${this.generateVSCodeLink(f.file)}`);
      lines.push(`  ${f.message}`);
      lines.push(`  Öneri: ${f.suggestion}`);
    });
    
    return lines.join('\n');
  }

  generateCohesionSection(findings) {
    const lines = ['4) Cohesion Guard'];
    
    findings.forEach(f => {
      lines.push(`- [${f.severity}] ${f.message} | Risk: ${f.riskScore}`);
      lines.push(`  Link: ${this.generateVSCodeLink(f.file, f.line)}`);
      lines.push(`  Öneri: ${f.suggestion}`);
    });
    
    return lines.join('\n');
  }

  generateNullGuardSection(findings) {
    const lines = ['5) Null/Optional Guard'];
    
    findings.forEach(f => {
      lines.push(`- [${f.severity}] ${this.formatPath(f.file)}:${f.line} | Risk: ${f.riskScore}`);
      lines.push(`  Link: ${this.generateVSCodeLink(f.file, f.line)}`);
      lines.push(`  Eksik: ${f.message}`);
      lines.push(`  Öneri: ${f.suggestion}`);
    });
    
    return lines.join('\n');
  }

  generateFixPackage(results) {
    const steps = [];
    
    if (results.syntax.length > 0) {
      steps.push('Adım 1: Syntax/unused hataları düzelt');
    }
    
    if (results.duplicates.length > 0 || results.copyPaste.length > 0) {
      steps.push('Adım 2: Duplicate/copy-paste refactor et');
    }
    
    if (results.nullGuards.length > 0) {
      steps.push('Adım 3: Null guard ekle + test yaz');
    }
    
    const affectedFiles = new Set();
    Object.values(results).forEach(findings => {
      findings.forEach(f => affectedFiles.add(f.file));
    });
    
    const testNeeded = results.nullGuards.length > 0 || results.duplicates.length > 0;
    
    return `📦 DÜZELTME PAKETİ
${steps.join('\n')}
Etki: ${affectedFiles.size} dosya, ${testNeeded ? 'test gerekli' : 'test opsiyonel'}`;
  }

  generateMetrics(results) {
    const syntaxCount = results.syntax.length;
    const unusedCount = results.syntax.filter(f => f.type === 'unused').length;
    const unreachableCount = results.syntax.filter(f => f.type === 'unreachable').length;
    
    const duplicateClusters = new Set();
    results.duplicates.forEach(f => {
      duplicateClusters.add(`${f.file}:${f.line}`);
    });
    
    const copyPasteBlocks = results.copyPaste.length;
    const copyPasteLines = results.copyPaste.reduce((sum, f) => {
      return sum + ((f.endLine || f.line) - f.line + 1);
    }, 0);
    
    const hotspotFiles = results.hotspots.map(f => path.basename(f.file));
    const nullGuardCount = results.nullGuards.length;
    
    return `📈 METRİKLER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Syntax: ${syntaxCount} | Unused: ${unusedCount} | Unreachable: ${unreachableCount}
Duplicate kümeleri: ${duplicateClusters.size} | En büyük küme: ${Math.max(2, duplicateClusters.size)}
Copy-paste blokları: ${copyPasteBlocks} | Toplam satır: ${copyPasteLines}
Hotspot dosyaları: ${hotspotFiles.join(', ') || 'yok'}
Null guard uyarıları: ${nullGuardCount}`;
  }

  generateTop5(findings) {
    const lines = ['🎯 TOP-5'];
    
    findings.slice(0, 5).forEach((f, index) => {
      lines.push(`${index + 1}) ${f.type} - ${this.formatPath(f.file)}:${f.line || 'N/A'} (Risk: ${f.riskScore})`);
    });
    
    return lines.join('\n');
  }

  generateVSCodeLink(file, line) {
    const absolutePath = path.resolve(file);
    if (line) {
      return `vscode://file/${absolutePath}:${line}`;
    }
    return `vscode://file/${absolutePath}`;
  }

  formatPath(filePath) {
    return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  }

  countBySeverity(results, severity) {
    let count = 0;
    Object.values(results).forEach(findings => {
      count += findings.filter(f => f.severity === severity).length;
    });
    return count;
  }
}