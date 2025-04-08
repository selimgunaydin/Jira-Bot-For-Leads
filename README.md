# Jira Task Atama Botu

Bu uygulama, Jira projelerindeki görevlerin otomatik olarak atanmasını ve yönetilmesini sağlayan bir masaüstü uygulamasıdır. Electron tabanlı bu uygulama, takım liderlerinin iş yükü dengelemesini ve görev yönetimini kolaylaştırmayı amaçlamaktadır.

## 🚀 Özellikler

- **Akıllı Görev Atama Sistemi**
  - En düşük tamamlanan görev sayısına göre atama
  - En düşük toplam puana göre atama
  - Rastgele atama
  - Belirli bir kullanıcıya atama
  - %80 performans altındaki geliştiricilere atama

- **Gelişmiş Görev Yönetimi**
  - Atanmamış görevleri otomatik listeleme
  - Görev durumunu "Selected for Development" olarak güncelleme
  - Görev atamalarında otomatik yorum ekleme
  - Gerçek zamanlı görev takibi

- **Performans İzleme**
  - Developer bazlı hedef puan belirleme
  - Tamamlanan görevlere göre performans hesaplama
  - Toplam görev puanlarına göre performans hesaplama

- **Özelleştirilebilir Ayarlar**
  - Test modu desteği
  - Developer listesi
  - Esnek task status seçenekleri
  - Modern ve kullanıcı dostu arayüz

## 💻 Kurulum

### Son Kullanıcı Kurulumu
1. [Releases](https://github.com/yourusername/jira-bot-lead/releases) sayfasından sisteminize uygun sürümü indirin:
   - macOS: `.dmg` veya `.zip`
   - Windows: `.exe` veya portable sürüm
   - Linux: `.AppImage` veya `.deb`

2. İndirilen dosyayı çalıştırın ve kurulum sihirbazını takip edin.

### Geliştirici Kurulumu

```bash
# Projeyi klonlayın
git clone https://github.com/yourusername/jira-bot-lead.git

# Proje dizinine gidin
cd jira-bot-lead

# Bağımlılıkları yükleyin
npm install

# Uygulamayı geliştirme modunda başlatın
npm start

# Platform bazlı paketleme
npm run pack-mac     # macOS için
npm run pack-win     # Windows için
npm run pack-linux   # Linux için
```

## ⚙️ Yapılandırma

### Gerekli Ayarlar
1. **Jira Ayarları**
   - Jira URL'si (örn: https://your-domain.atlassian.net)
   - E-posta adresi
   - API Token ([Jira API Token nasıl alınır?](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/))
   - Proje anahtarı

2. **Uygulama Ayarları**
   - Görev durumu seçimi
   - Performans hesaplama tipi
   - Developer e-postaları
   - Test modu ayarları

## 🛠 Teknolojiler

- Electron.js
- Node.js
- Tailwind CSS
- Axios
- Winston (Loglama)
- Electron Store (Veri Saklama)
- Slack Web API (Bildirimler için)