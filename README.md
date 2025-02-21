# Jira Task Atama Botu

Bu uygulama, Jira projelerindeki görevlerin otomatik olarak atanmasını ve yönetilmesini sağlayan bir masaüstü uygulamasıdır.

## Özellikler

- Atanmamış görevleri otomatik listeleme
- Aktif developerları görüntüleme
- Görev puanlarına göre otomatik atama
- developer iş yükü dengeleme
- Gerçek zamanlı görev takibi

## Kurulum

1. Sisteminize uygun kurulum dosyasını indirin:
   - macOS: `.dmg` veya `.zip`
   - Windows: `.exe` veya portable sürüm
   - Linux: `.AppImage` veya `.deb`

2. Kurulum dosyasını çalıştırın ve talimatları takip edin.

## Yapılandırma

İlk çalıştırmada aşağıdaki bilgileri girmeniz gerekecektir:

- Jira URL'si
- E-posta adresi
- API Token
- Proje anahtarı

## Geliştirici Kurulumu

```bash
# Bağımlılıkları yükleyin
npm install

# Uygulamayı geliştirme modunda başlatın
npm start

# Uygulamayı paketleyin
npm run build
```

## Lisans

ISC

## İletişim

Herhangi bir sorun veya öneriniz için Issues bölümünü kullanabilirsiniz. 