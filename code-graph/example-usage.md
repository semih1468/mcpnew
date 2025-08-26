# Code Graph MCP - Kullanım Örnekleri

## 1. Proje Analizi

```javascript
// İlk analiz (cache'e kaydeder)
await analyze_project({
  path: "C:/my-project",
  force: false  // Cache varsa kullan
})

// Zorla yeniden analiz
await analyze_project({
  path: "C:/my-project", 
  force: true  // Cache'i yoksay, yeniden analiz et
})
```

## 2. Sembol Arama

```javascript
// Tüm "handle" ile başlayan fonksiyonları bul
await find_symbol({
  query: "handle"
})

// Sadece class'ları ara
await find_symbol({
  query: "Component",
  type: "class"
})

// Değişken ara
await find_symbol({
  query: "config",
  type: "variable"
})
```

## 3. Bağımlılık Analizi

```javascript
// Bir fonksiyonun neyi kullandığını bul
await get_dependencies({
  symbolId: "src/utils.js:formatDate:10",
  depth: 2  // 2 seviye derinlik
})

// Bir fonksiyonu kim kullanıyor?
await get_dependents({
  symbolId: "src/api.js:fetchData:25",
  depth: 1
})
```

## 4. Çağrı Grafiği

```javascript
// handleSubmit fonksiyonunun çağrı grafiği
await get_call_graph({
  functionName: "handleSubmit",
  depth: 3  // 3 seviye derinlikte çağrıları göster
})
```

## 5. Dosya Sembolleri

```javascript
// Bir dosyadaki tüm tanımlamalar
await get_file_symbols({
  filepath: "src/components/Button.jsx"
})

// Sonuç:
{
  "filepath": "src/components/Button.jsx",
  "symbolCount": 5,
  "symbols": [
    {
      "id": "src/components/Button.jsx:Button:10",
      "type": "function",
      "name": "Button",
      "line": 10
    },
    {
      "id": "src/components/Button.jsx:handleClick:15", 
      "type": "function",
      "name": "handleClick",
      "line": 15
    }
  ]
}
```

## 6. Cache Yönetimi

```javascript
// Projeyi cache'den yükle
await load_cached_graph({
  path: "C:/my-project"
})

// Belirli proje cache'ini temizle
await clear_cache({
  path: "C:/my-project"
})

// Tüm cache'i temizle
await clear_cache({})

// Cache'lenmiş projeleri listele
await list_cached_projects()
```

## 7. İstatistikler

```javascript
// Graf istatistiklerini al
await get_graph_stats()

// Sonuç:
{
  "totalNodes": 245,      // Toplam sembol sayısı
  "totalEdges": 432,      // Toplam ilişki sayısı
  "fileCount": 28,        // Dosya sayısı
  "nodeTypes": {
    "function": 120,
    "class": 15,
    "variable": 110
  },
  "edgeTypes": {
    "imports": 180,
    "calls": 230,
    "extends": 22
  }
}
```

## Gerçek Kullanım Senaryoları

### Senaryo 1: Unused Code Tespiti
```javascript
// 1. Projeyi analiz et
await analyze_project({ path: "./my-app" })

// 2. Tüm fonksiyonları bul
const functions = await find_symbol({ type: "function" })

// 3. Her fonksiyon için dependents kontrol et
for (const func of functions.symbols) {
  const deps = await get_dependents({ 
    symbolId: func.id,
    depth: 1 
  })
  
  if (deps.dependents.length === 0) {
    console.log(`Unused function: ${func.name} at ${func.file}:${func.line}`)
  }
}
```

### Senaryo 2: Refactoring Etki Analizi
```javascript
// formatDate fonksiyonunu değiştirmeden önce
// kim kullanıyor kontrol et

// 1. Fonksiyonu bul
const results = await find_symbol({ 
  query: "formatDate",
  type: "function"
})

// 2. Kullananları bul (3 seviye derinlikte)
const impact = await get_dependents({
  symbolId: results.symbols[0].id,
  depth: 3
})

console.log(`${impact.dependents.length} yerde kullanılıyor`)
impact.dependents.forEach(dep => {
  console.log(`- ${dep.fromData.file}:${dep.fromData.line}`)
})
```

### Senaryo 3: Circular Dependency Kontrolü
```javascript
// Bir modülün dependencies ve dependents'larını karşılaştır
const deps = await get_dependencies({
  symbolId: "src/moduleA.js:exportedFunc:1",
  depth: 5
})

const dependents = await get_dependents({
  symbolId: "src/moduleA.js:exportedFunc:1", 
  depth: 5
})

// Çakışmaları kontrol et
const circular = deps.dependencies.filter(d => 
  dependents.dependents.some(dd => 
    dd.fromData?.file === d.toData?.file
  )
)

if (circular.length > 0) {
  console.log("Circular dependency detected!")
}
```

### Senaryo 4: API Kullanım Raporu
```javascript
// Tüm API çağrılarını bul
const apiCalls = await find_symbol({ query: "fetch" })

// Her API çağrısı için çağıran yerleri bul
for (const call of apiCalls.symbols) {
  const callers = await get_dependents({
    symbolId: call.id,
    depth: 2
  })
  
  console.log(`API ${call.name} kullanım sayısı: ${callers.dependents.length}`)
}
```

## Notlar

- **symbolId formatı**: `dosya:isim:satır` şeklinde
- **depth**: İlişki derinliği (1-5 arası önerilir)
- **Cache**: Büyük projeler için cache kullanımı performansı artırır
- **force**: Cache'i yoksayıp yeniden analiz için `true` kullan