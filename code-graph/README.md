# Code Graph MCP

Kod ilişkilerini analiz eden ve graf yapısında saklayan MCP servisi.

## Özellikler

- **Kod Analizi**: JS/TS/JSX/TSX dosyalarını parse eder
- **İlişki Grafiği**: Fonksiyon çağrıları, import/export, class inheritance takibi
- **Cache Sistemi**: Analiz edilen projeleri disk'e kaydeder
- **Sembol Arama**: Fonksiyon, class, değişken arama
- **Bağımlılık Analizi**: Hangi kod hangi kodu kullanıyor?

## Kurulum

```bash
npm install
```

## Kullanım

MCP client config'e ekle:

```json
{
  "mcpServers": {
    "code-graph": {
      "command": "node",
      "args": ["C:/xampp/htdocs/mcp/code-graph/src/index.js"]
    }
  }
}
```

## Araçlar

### analyze_project
Proje analizi yapar ve cache'e kaydeder.

```javascript
analyze_project({ 
  path: "./my-project",
  force: false  // Cache varsa kullan
})
```

### find_symbol
Sembol arama (fonksiyon, class, değişken).

```javascript
find_symbol({
  query: "handleClick",
  type: "function"  // optional: function, class, variable
})
```

### get_dependencies
Bir sembolün bağımlılıklarını getirir.

```javascript
get_dependencies({
  symbolId: "src/index.js:main:10",
  depth: 2
})
```

### get_dependents
Bir sembolü kullanan kodları bulur.

```javascript
get_dependents({
  symbolId: "utils/helper.js:formatDate:5",
  depth: 1
})
```

### get_call_graph
Fonksiyon çağrı grafiği.

```javascript
get_call_graph({
  functionName: "processData",
  depth: 3
})
```

### get_file_symbols
Dosyadaki tüm semboller.

```javascript
get_file_symbols({
  filepath: "src/components/Button.jsx"
})
```

### get_graph_stats
Graf istatistikleri.

```javascript
get_graph_stats()
// Returns: node count, edge count, file count, etc.
```

### load_cached_graph
Cache'den yükle.

```javascript
load_cached_graph({
  path: "./my-project"
})
```

### clear_cache
Cache temizle.

```javascript
clear_cache({
  path: "./my-project"  // optional, tümünü temizler
})
```

### list_cached_projects
Cache'lenmiş projeleri listele.

```javascript
list_cached_projects()
```

## Çevre Değişkenleri

- `MAX_FILE_SIZE`: Max dosya boyutu (default: 5MB)
- `DB_PATH`: Cache dizini (default: ./db)

## Desteklenen Dosya Tipleri

- `.js`
- `.jsx`
- `.ts`
- `.tsx`
- `.mjs`

## Göz Ardı Edilen Dizinler

- node_modules
- .git
- dist
- build
- .next
- coverage