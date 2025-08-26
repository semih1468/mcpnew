import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import { minimatch } from 'minimatch';
import { SyntaxAnalyzer } from '../analyzers/SyntaxAnalyzer.js';
import { DuplicateAnalyzer } from '../analyzers/DuplicateAnalyzer.js';
import { CopyPasteAnalyzer } from '../analyzers/CopyPasteAnalyzer.js';
import { HotspotAnalyzer } from '../analyzers/HotspotAnalyzer.js';
import { CohesionAnalyzer } from '../analyzers/CohesionAnalyzer.js';
import { NullGuardAnalyzer } from '../analyzers/NullGuardAnalyzer.js';
import { ReportGenerator } from '../utils/ReportGenerator.js';

export class AuditService {
  constructor() {
    this.syntaxAnalyzer = new SyntaxAnalyzer();
    this.duplicateAnalyzer = new DuplicateAnalyzer();
    this.copyPasteAnalyzer = new CopyPasteAnalyzer();
    this.hotspotAnalyzer = new HotspotAnalyzer();
    this.cohesionAnalyzer = new CohesionAnalyzer();
    this.nullGuardAnalyzer = new NullGuardAnalyzer();
    this.reportGenerator = new ReportGenerator();
    this.fileCache = new Map();
  }

  async auditRepository(paths, exclude) {
    const files = await this.collectFiles(paths, exclude);
    const results = {
      syntax: [],
      duplicates: [],
      copyPaste: [],
      hotspots: [],
      cohesion: [],
      nullGuards: []
    };

    for (const file of files) {
      try {
        const fileResults = await this.analyzeFile(file);
        this.mergeResults(results, fileResults);
      } catch (error) {
        console.error(`Error analyzing ${file}:`, error.message);
      }
    }

    const duplicateClusters = await this.duplicateAnalyzer.findClusters(files, this.fileCache);
    results.duplicates.push(...duplicateClusters);

    const copyPasteClusters = await this.copyPasteAnalyzer.findClusters(files, this.fileCache);
    results.copyPaste.push(...copyPasteClusters);

    return this.reportGenerator.generate(results, files.length);
  }

  async auditFile(filePath) {
    const absolutePath = path.resolve(filePath);
    const results = await this.analyzeFile(absolutePath);
    return this.reportGenerator.generate(results, 1);
  }

  async collectFiles(paths, exclude) {
    const allFiles = new Set();
    
    for (const searchPath of paths) {
      const absolutePath = path.resolve(searchPath);
      const stats = await fs.stat(absolutePath).catch(() => null);
      
      if (!stats) continue;
      
      if (stats.isFile()) {
        allFiles.add(absolutePath);
      } else {
        const pattern = path.join(absolutePath, '**/*.{js,jsx,ts,tsx,java,cs,py,go,rb}');
        const files = await glob(pattern, { 
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/coverage/**']
        });
        
        for (const file of files) {
          const resolvedFile = path.resolve(file);
          if (exclude && this.isExcluded(resolvedFile, exclude)) continue;
          allFiles.add(resolvedFile);
        }
      }
    }
    
    return Array.from(allFiles);
  }

  isExcluded(file, excludePatterns) {
    return excludePatterns.some(pattern => minimatch(file, pattern));
  }

  async analyzeFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    this.fileCache.set(filePath, content);

    const results = {
      syntax: [],
      duplicates: [],
      copyPaste: [],
      hotspots: [],
      cohesion: [],
      nullGuards: []
    };

    results.syntax = await this.syntaxAnalyzer.analyze(filePath, content);
    results.hotspots = await this.hotspotAnalyzer.analyze(filePath, content);
    results.cohesion = await this.cohesionAnalyzer.analyze(filePath, content);
    results.nullGuards = await this.nullGuardAnalyzer.analyze(filePath, content);

    return results;
  }

  mergeResults(target, source) {
    Object.keys(source).forEach(key => {
      if (Array.isArray(target[key]) && Array.isArray(source[key])) {
        target[key].push(...source[key]);
      }
    });
  }
}