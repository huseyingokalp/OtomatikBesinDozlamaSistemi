/*
 * flc_sugeno.ino - Bulanik Mantik Denetleyici (FLC) iskeleti / ESP32
 * Cilek Dozlama Sistemi - sifir-dereceli (zero-order) Sugeno cikarimi
 *
 * Amac: pH ve EC hatasina gore deterministik, yorumlanabilir doz kestirimi.
 * - Girisler: hata e = hedef - olculen ve hata degisimi de = e - e_onceki
 * - Bulaniklastirma: ucgen uyelik fonksiyonlari {NB, NK, S, PK, PB}
 * - Kural tabani (FAM): (e, de) -> cikis tekil degeri (singleton, mL)
 * - Durulastirma: agirlikli ortalama (Sugeno) -> surekli doz (mL)
 * Cikis isareti: negatif = ASIT (pH dusur), pozitif = BAZ (pH yukselt).
 * EC icin 5x5 FAM (rapor Tablo 9): pozitif cikis = BESIN A-B pompalari,
 * negatif cikis = SU vanasi (seyreltme).
 *
 * NOT: Bu DETERMINISTIK bir denetleyicidir; egitim verisi gerektirmez.
 * Uyelik fonksiyonu parametreleri ve kural tekil degerleri, sunucuda
 * ANFIS ile veriden ayarlanip buraya parametre olarak indirilebilir.
 * Nihai acma/kapama ve guvenlik sinirlari ust katmanda uygulanir.
 */

#include <math.h>

// ---- Ayarlanabilir parametreler (ANFIS / elle) ----
struct FlcParams {
  // ucgen uyelik fonksiyonu merkezleri (pH birimi): NB, NK, S, PK, PB
  float c[5]      = { -1.5f, -0.75f, 0.0f, 0.75f, 1.5f };
  float halfWidth = 0.75f;     // ucgen yari genisligi (komsu merkez araligi)
  // Sugeno kural tekil degerleri (mL) - e kumesine gore taban doz
  // NB(cok yuksek pH)->guclu asit(-), ... PB(cok dusuk pH)->guclu baz(+)
  float out[5]    = { -8.0f, -3.0f, 0.0f, +3.0f, +8.0f };
  float deGain    = 0.5f;      // de etkisi (salinim/asim sonumleme)
  float vMax      = 12.0f;     // adim basina en yuksek hacim (mL)
};

// Ucgen uyelik derecesi
static float triMF(float x, float center, float halfW) {
  float d = fabsf(x - center);
  if (d >= halfW) return 0.0f;
  return 1.0f - d / halfW;
}

// e icin 5 kumenin uyelik derecesi
static void fuzzify(float e, const FlcParams& p, float mu[5]) {
  for (int i = 0; i < 5; i++) mu[i] = triMF(e, p.c[i], p.halfWidth);
}

/*
 * Sifir-dereceli Sugeno cikarimi:
 *   doz = ( SUM_i  mu_i * out_i ) / ( SUM_i mu_i )
 * de (hata degisimi) ile cikis olceklenerek asim azaltilir.
 * Donus: mL cinsinden doz (isaret yon belirtir). 0 ~ doz yok.
 */
float flcSugeno(float e, float de, const FlcParams& p) {
  float mu[5];
  fuzzify(e, p, mu);

  float num = 0.0f, den = 0.0f;
  for (int i = 0; i < 5; i++) {
    num += mu[i] * p.out[i];
    den += mu[i];
  }
  if (den < 1e-6f) return 0.0f;          // hicbir kural atesleme - doz yok
  float doz = num / den;

  // de ile sonumleme: hata azaliyorsa (de ile e ters isaretli) dozu kis
  float damp = 1.0f - p.deGain * tanhf(de * (e >= 0 ? 1.0f : -1.0f));
  if (damp < 0.2f) damp = 0.2f;
  doz *= damp;

  // ust sinir (asimi onle)
  if (doz >  p.vMax) doz =  p.vMax;
  if (doz < -p.vMax) doz = -p.vMax;
  return doz;
}

/*
 * ---- EC icin 5x5 FAM (rapor Tablo 9) ----
 * Girisler: e = EC_hedef - EC_olculen (mS/cm) ve de = e - e_onceki.
 * Her iki giris {NB, NK, S, PK, PB} kumelerine bulaniklastirilir;
 * kural ateslemesi carpim (product) t-normu ile, durulastirma agirlikli
 * ortalama (sifir-dereceli Sugeno) ile yapilir.
 * Tekil degerler (mL esdegeri taban doz):
 *   SB = -8 (su, buyuk seyreltme), SK = -3 (su), Y = 0,
 *   DK = +3 (besin A-B), DB = +8 (besin A-B, buyuk doz)
 * Degerler rezervuar hacmine gore kalibre edilir; ANFIS ile guncellenebilir.
 */
struct FlcEcParams {
  // uyelik fonksiyonu merkezleri
  float cE[5]   = { -1.0f, -0.5f, 0.0f, 0.5f, 1.0f };   // e (mS/cm)
  float halfE   = 0.5f;
  float cDe[5]  = { -0.4f, -0.2f, 0.0f, 0.2f, 0.4f };   // de (mS/cm/adim)
  float halfDe  = 0.2f;
  // FAM: satir = e kumesi (NB..PB), sutun = de kumesi (NB..PB) - Tablo 9
  float fam[5][5] = {
    // de:  NB     NK     S      PK     PB
    { -8.0f, -8.0f, -8.0f, -3.0f, -3.0f },  // e = NB (EC cok yuksek)
    { -8.0f, -3.0f, -3.0f, -3.0f,  0.0f },  // e = NK (EC yuksek)
    { -3.0f, -3.0f,  0.0f, +3.0f, +3.0f },  // e = S  (hedefte)
    {  0.0f, +3.0f, +3.0f, +3.0f, +8.0f },  // e = PK (EC dusuk)
    { +3.0f, +3.0f, +8.0f, +8.0f, +8.0f }   // e = PB (EC cok dusuk)
  };
  float vMax = 12.0f;   // adim basina en yuksek hacim (mL esdegeri)
};

/*
 * 5x5 FAM uzerinde sifir-dereceli Sugeno cikarimi:
 *   doz = ( SUM_ij muE_i * muDe_j * fam[i][j] ) / ( SUM_ij muE_i * muDe_j )
 * Donus: mL esdegeri doz; pozitif = besin A-B, negatif = su (seyreltme).
 */
float flcSugenoEC(float e, float de, const FlcEcParams& p) {
  float muE[5], muDe[5];
  for (int i = 0; i < 5; i++) {
    muE[i]  = triMF(e,  p.cE[i],  p.halfE);
    muDe[i] = triMF(de, p.cDe[i], p.halfDe);
  }
  float num = 0.0f, den = 0.0f;
  for (int i = 0; i < 5; i++) {
    if (muE[i] <= 0.0f) continue;
    for (int j = 0; j < 5; j++) {
      float w = muE[i] * muDe[j];          // carpim t-normu
      num += w * p.fam[i][j];
      den += w;
    }
  }
  if (den < 1e-6f) return 0.0f;            // hicbir kural atesleme - doz yok
  float doz = num / den;
  if (doz >  p.vMax) doz =  p.vMax;        // shield ust siniri
  if (doz < -p.vMax) doz = -p.vMax;
  return doz;
}

// ---- Ornek kullanim (ana dongude) ----
FlcParams   flcPH;   // pH denetleyici parametreleri (1B FAM + de sonumleme)
FlcEcParams flcEC;   // EC denetleyici parametreleri (5x5 FAM, Tablo 9)

static float ePH_prev = 0.0f;

// pH icin: olculen ve hedef -> hangi pompa, ne kadar mL
void dozlaPH(float phOlculen, float phHedef) {
  float e  = phHedef - phOlculen;        // pozitif: pH dusuk -> BAZ gerek
  float de = e - ePH_prev;
  ePH_prev = e;

  float ml = flcSugeno(e, de, flcPH);    // + : baz, - : asit
  const float esik = 0.3f;               // olu bolge (gereksiz dozu engelle)
  if (ml > esik) {
    // pompaCalistir(POMPA_BAZ, ml);     // donanim cagrisi (ust katman)
  } else if (ml < -esik) {
    // pompaCalistir(POMPA_ASIT, -ml);
  }
  // dozlama sonrasi karistirma/olu zaman (tau_d) kadar beklenip yeniden olcul
}

static float eEC_prev = 0.0f;

// EC icin: olculen ve hedef -> besin A-B pompalari mi, su vanasi mi
void dozlaEC(float ecOlculen, float ecHedef) {
  float e  = ecHedef - ecOlculen;        // pozitif: EC dusuk -> BESIN gerek
  float de = e - eEC_prev;
  eEC_prev = e;

  float ml = flcSugenoEC(e, de, flcEC);  // + : besin A-B, - : su
  const float esik = 0.5f;               // olu bolge (gereksiz dozu engelle)
  if (ml > esik) {
    // A ve B es zamanli ve es miktarda dozlanir (besin dengesi bozulmasin)
    // pompaCalistir(POMPA_BESIN_A, ml);
    // pompaCalistir(POMPA_BESIN_B, ml);
  } else if (ml < -esik) {
    // pompaCalistir(VANA_SU, -ml);      // temiz su ile seyreltme
  }
  // dozlama sonrasi karistirma/olu zaman (tau_d) kadar beklenip yeniden olcul
}

void setup() {
  // Parametreler EEPROM/NVS'ten ya da sunucudan (ANFIS) yuklenebilir.
}

void loop() {
  // float ph = phSensorOku();
  // dozlaPH(ph, hedefPHGetir(aktifEvre));
  // float ec = ecSensorOku();
  // dozlaEC(ec, hedefECGetir(aktifEvre));
  // delay(OLCUM_PERIYODU);
}
