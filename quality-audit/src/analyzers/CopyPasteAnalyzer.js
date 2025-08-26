export class CopyPasteAnalyzer {
  async analyze(filePath, content) {
    return [];
  }

  async findClusters(files, fileCache) {
    const findings = [];
    const codeBlocks = new Map();
    
    for (const file of files) {
      const content = fileCache.get(file);
      if (!content) continue;
      
      const blocks = this.extractCodeBlocks(content);
      
      for (const block of blocks) {
        const normalized = this.normalizeBlock(block.code);
        
        if (normalized.length < 5) continue;
        
        const signature = this.createBlockSignature(normalized);
        
        if (!codeBlocks.has(signature)) {
          codeBlocks.set(signature, []);
        }
        
        codeBlocks.get(signature).push({
          file,
          startLine: block.startLine,
          endLine: block.endLine,
          code: block.code
        });
      }
    }
    
    codeBlocks.forEach((occurrences) => {
      if (occurrences.length > 1) {
        const isTestFile = occurrences[0].file.includes('.test.') || 
                          occurrences[0].file.includes('.spec.');
        
        for (let i = 0; i < occurrences.length - 1; i++) {
          const lineCount = occurrences[i].endLine - occurrences[i].startLine + 1;
          
          findings.push({
            severity: lineCount > 10 ? 'HIGH' : 'MEDIUM',
            file: occurrences[i].file,
            line: occurrences[i].startLine,
            endLine: occurrences[i].endLine,
            type: 'copy_paste',
            message: `Copy-paste detected (${lineCount} lines)`,
            suggestion: 'Extract to reusable function',
            riskScore: isTestFile ? 30 : (lineCount > 10 ? 65 : 45),
            relatedFile: occurrences[i + 1].file,
            relatedLine: occurrences[i + 1].startLine
          });
        }
      }
    });
    
    return findings;
  }

  extractCodeBlocks(content) {
    const blocks = [];
    const lines = content.split('\n');
    const windowSize = 5;
    
    for (let i = 0; i <= lines.length - windowSize; i++) {
      const block = lines.slice(i, i + windowSize);
      const nonEmptyLines = block.filter(line => line.trim().length > 0);
      
      if (nonEmptyLines.length >= 5) {
        blocks.push({
          startLine: i + 1,
          endLine: i + windowSize,
          code: block.join('\n')
        });
      }
    }
    
    for (let size = 10; size <= 30; size += 5) {
      for (let i = 0; i <= lines.length - size; i++) {
        const block = lines.slice(i, i + size);
        const nonEmptyLines = block.filter(line => line.trim().length > 0);
        
        if (nonEmptyLines.length >= size * 0.7) {
          blocks.push({
            startLine: i + 1,
            endLine: i + size,
            code: block.join('\n')
          });
        }
      }
    }
    
    return blocks;
  }

  normalizeBlock(code) {
    const lines = code.split('\n')
      .map(line => line.trim())
      .filter(line => 
        line.length > 0 && 
        !line.startsWith('//') && 
        !line.startsWith('/*') &&
        !line.startsWith('*')
      );
    
    return lines.map(line => 
      line.replace(/\s+/g, ' ')
          .replace(/['"`]/g, '"')
          .replace(/\d+/g, 'N')
    );
  }

  createBlockSignature(normalizedLines) {
    return normalizedLines
      .map(line => {
        const tokens = line.replace(/[^\w\s]/g, ' ')
                          .split(/\s+/)
                          .filter(Boolean);
        return tokens.join('_');
      })
      .join('|');
  }

  calculateSimilarity(block1, block2) {
    const tokens1 = block1.split(/\s+/);
    const tokens2 = block2.split(/\s+/);
    
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }
}