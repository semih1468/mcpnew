export class CohesionAnalyzer {
  async analyze(filePath, content) {
    const findings = [];
    const classes = this.extractClasses(content);
    
    for (const cls of classes) {
      const domains = this.detectDomains(cls.body);
      
      if (domains.size >= 2) {
        const domainList = Array.from(domains);
        
        findings.push({
          severity: domains.size > 2 ? 'HIGH' : 'MEDIUM',
          file: filePath,
          line: cls.line,
          type: 'cohesion',
          message: `Low cohesion in ${cls.name}: ${domains.size} domains (${domainList.join(', ')})`,
          suggestion: `Split ${cls.name} into separate classes per domain`,
          riskScore: domains.size > 2 ? 65 : 45
        });
      }
    }
    
    return findings;
  }

  extractClasses(content) {
    const classes = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const classMatch = line.match(/^\s*(?:export\s+)?class\s+(\w+)/);
      
      if (classMatch) {
        const name = classMatch[1];
        const body = this.extractClassBody(lines, i);
        
        classes.push({
          name,
          line: i + 1,
          body
        });
      }
    }
    
    return classes;
  }

  extractClassBody(lines, startIndex) {
    let braceCount = 0;
    let started = false;
    const body = [];
    
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          started = true;
        } else if (char === '}') {
          braceCount--;
        }
      }
      
      if (started) {
        body.push(line);
      }
      
      if (started && braceCount === 0) {
        break;
      }
    }
    
    return body.join('\n');
  }

  detectDomains(classBody) {
    const domains = new Set();
    
    const domainPatterns = {
      'database': [
        /\b(query|select|insert|update|delete|table|column|row|database|sql|orm|model)\b/gi,
        /\b(save|find|create|destroy|migrate)\b/gi
      ],
      'http': [
        /\b(request|response|http|https|url|api|rest|endpoint|route|path)\b/gi,
        /\b(get|post|put|patch|delete|head|options)\b/gi
      ],
      'auth': [
        /\b(auth|login|logout|session|token|jwt|oauth|permission|role|user|password)\b/gi,
        /\b(authenticate|authorize|verify)\b/gi
      ],
      'file': [
        /\b(file|directory|path|fs|stream|buffer|read|write|mkdir|unlink)\b/gi,
        /\b(open|close|stat|watch)\b/gi
      ],
      'network': [
        /\b(socket|tcp|udp|websocket|mqtt|amqp|connection|port)\b/gi,
        /\b(connect|disconnect|listen|bind)\b/gi
      ],
      'cache': [
        /\b(cache|redis|memcache|ttl|expire|invalidate)\b/gi,
        /\b(get|set|del|flush)\b/gi
      ],
      'email': [
        /\b(email|mail|smtp|imap|pop3|message|attachment|sender|recipient)\b/gi,
        /\b(send|receive|compose)\b/gi
      ],
      'payment': [
        /\b(payment|stripe|paypal|transaction|charge|refund|invoice|billing)\b/gi,
        /\b(pay|subscribe|cancel)\b/gi
      ],
      'validation': [
        /\b(validate|validator|schema|rule|constraint|sanitize|clean)\b/gi,
        /\b(isValid|check|verify)\b/gi
      ],
      'logging': [
        /\b(log|logger|console|debug|info|warn|error|trace)\b/gi,
        /\b(winston|morgan|bunyan|pino)\b/gi
      ]
    };
    
    Object.entries(domainPatterns).forEach(([domain, patterns]) => {
      let matches = 0;
      
      patterns.forEach(pattern => {
        const found = classBody.match(pattern);
        if (found) {
          matches += found.length;
        }
      });
      
      if (matches >= 3) {
        domains.add(domain);
      }
    });
    
    return domains;
  }
}