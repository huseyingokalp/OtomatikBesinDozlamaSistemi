//
//  CilekDozlamaApp.swift
//  Çilek Dozlama Sistemi - iOS uygulaması (SwiftUI)
//
//  ESP32 hub'ın REST API'sine bağlanır (varsayılan http://192.168.4.1).
//  Telefonu hub'ın "CilekDozlama" WiFi ağına bağlayın, sonra uygulamayı açın.
//
//  Gereksinim: iOS 16+ (Swift Charts), Xcode 15+.
//  KURULUM ve Info.plist ayarları için README_iOS.md dosyasına bakın
//  (yerel HTTP için NSAllowsLocalNetworking + Yerel Ağ izni gerekir).
//
//  Bu tek dosya; yeni bir SwiftUI App projesine eklemeniz yeterlidir.
//

import SwiftUI
import Charts

// MARK: - Tema
enum Palette {
    static let green = Color(red: 0.10, green: 0.48, blue: 0.28)
    static let bg    = Color(red: 0.957, green: 0.965, blue: 0.945)
    static let red   = Color(red: 0.77, green: 0.23, blue: 0.23)
    static let blue  = Color(red: 0.15, green: 0.39, blue: 0.72)
    static let amber = Color(red: 0.72, green: 0.47, blue: 0.11)
}

// MARK: - Modeller (REST JSON ile eşleşir)
struct Latest: Codable {
    var seq: Int = 0, ts: Int = 0
    var ph: Double = 0, ec: Double = 0, sic: Double = 0, su: Double = 0
}
struct Reading: Codable, Identifiable {
    var id: Int; var ts: Int
    var ph: Double; var ec: Double; var sic: Double; var su: Double
}
struct Dose: Codable, Identifiable {
    var id: Int; var ts: Int
    var cozelti: String; var tetik: String
    var miktar_ml: Double; var oncesi: Double; var sonrasi: Double
}
struct AlarmItem: Codable, Identifiable {
    var id: Int; var ts: Int
    var turu: String; var mesaj: String; var deger: Double; var durum: String
}
struct Target: Codable {
    var sera_id: Int = 1
    var ph_min: Double = 5.8, ph_max: Double = 6.2
    var ec_min: Double = 1.4, ec_max: Double = 1.8
    var sic_min: Double = 18,  sic_max: Double = 24
}

let COZ_AD = ["Asit", "Baz", "Besin A", "Besin B", "Su"]   // index = coz

// MARK: - API istemcisi
@MainActor
final class API: ObservableObject {
    @Published var base: String { didSet { UserDefaults.standard.set(base, forKey: "hubURL") } }
    @Published var latest = Latest()
    @Published var readings: [Reading] = []
    @Published var doses: [Dose] = []
    @Published var alarms: [AlarmItem] = []
    @Published var target = Target()
    @Published var online = false

    init() { base = UserDefaults.standard.string(forKey: "hubURL") ?? "http://192.168.1.50:8000" }  // varsayilan: yerel sunucu REST adresi

    private func url(_ path: String) -> URL? { URL(string: base + path) }

    private func get<T: Decodable>(_ path: String, as type: T.Type) async -> T? {
        guard let u = url(path) else { return nil }
        var req = URLRequest(url: u); req.timeoutInterval = 4
        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            return try JSONDecoder().decode(T.self, from: data)
        } catch { return nil }
    }

    @discardableResult
    private func post(_ path: String) async -> Bool {
        guard let u = url(path) else { return false }
        var req = URLRequest(url: u); req.httpMethod = "POST"; req.timeoutInterval = 4
        do { _ = try await URLSession.shared.data(for: req); return true } catch { return false }
    }

    func refresh() async {
        if let l: Latest = await get("/api/latest", as: Latest.self) { latest = l; online = true }
        else { online = false }
        if let r: [Reading] = await get("/api/readings?limit=40", as: [Reading].self) { readings = Array(r.reversed()) }
        if let d: [Dose] = await get("/api/dozlama?limit=10", as: [Dose].self) { doses = d }
        if let a: [AlarmItem] = await get("/api/alarm", as: [AlarmItem].self) { alarms = a }
        if let t: [Target] = await get("/api/target?sera=1", as: [Target].self), let first = t.first { target = first }
    }

    func dose(_ coz: Int, ml: Double = 10) async { await post("/api/dose?sera=1&coz=\(coz)&ml=\(ml)") }
    func resolve(_ id: Int) async { await post("/api/resolve?id=\(id)") }
    func saveTarget(_ t: Target) async {
        await post("/api/target?sera=1&phmin=\(t.ph_min)&phmax=\(t.ph_max)&ecmin=\(t.ec_min)&ecmax=\(t.ec_max)&smin=\(t.sic_min)&smax=\(t.sic_max)")
    }
}

// MARK: - Yardımcılar
func statusColor(_ v: Double, _ a: Double, _ b: Double) -> Color { v < a ? Palette.blue : (v > b ? Palette.red : Palette.green) }
func statusText(_ v: Double, _ a: Double, _ b: Double) -> String { v < a ? "DÜŞÜK" : (v > b ? "YÜKSEK" : "NORMAL") }

// MARK: - App girişi
@main
struct CilekDozlamaApp: App {
    @StateObject private var api = API()
    var body: some Scene {
        WindowGroup { RootView().environmentObject(api) }
    }
}

struct RootView: View {
    @EnvironmentObject var api: API
    var body: some View {
        TabView {
            DashboardView().tabItem { Label("Panel", systemImage: "gauge.medium") }
            HistoryView().tabItem { Label("Geçmiş", systemImage: "clock.arrow.circlepath") }
            SettingsView().tabItem { Label("Ayarlar", systemImage: "gearshape") }
        }
        .tint(Palette.green)
        .task {
            while !Task.isCancelled {
                await api.refresh()
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }
}

// MARK: - Metrik kartı
struct MetricCard: View {
    let title: String, value: Double, unit: String, lo: Double, hi: Double, decimals: Int
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title).font(.caption).foregroundStyle(.secondary)
                Spacer()
                Text(statusText(value, lo, hi))
                    .font(.caption2).bold().foregroundStyle(statusColor(value, lo, hi))
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .background(statusColor(value, lo, hi).opacity(0.15), in: Capsule())
            }
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(String(format: "%.\(decimals)f", value))
                    .font(.system(.title, design: .rounded)).bold().monospacedDigit()
                Text(unit).font(.caption).foregroundStyle(.secondary)
            }
            Text("Hedef \(String(format: "%.1f", lo))-\(String(format: "%.1f", hi))")
                .font(.caption2).foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.quaternary))
    }
}

// MARK: - Panel
struct DashboardView: View {
    @EnvironmentObject var api: API
    private let cols = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // bağlantı durumu
                    HStack(spacing: 8) {
                        Circle().fill(api.online ? Palette.green : Palette.red).frame(width: 9, height: 9)
                        Text(api.online ? "Hub'a bağlı" : "Hub'a ulaşılamıyor - WiFi ve adresi kontrol edin")
                            .font(.caption).foregroundStyle(.secondary)
                        Spacer()
                    }

                    LazyVGrid(columns: cols, spacing: 12) {
                        MetricCard(title: "pH", value: api.latest.ph, unit: "", lo: api.target.ph_min, hi: api.target.ph_max, decimals: 2)
                        MetricCard(title: "EC", value: api.latest.ec, unit: "mS/cm", lo: api.target.ec_min, hi: api.target.ec_max, decimals: 2)
                        MetricCard(title: "Sıcaklık", value: api.latest.sic, unit: "°C", lo: api.target.sic_min, hi: api.target.sic_max, decimals: 1)
                        MetricCard(title: "Su", value: api.latest.su, unit: "%", lo: 30, hi: 100, decimals: 0)
                    }

                    chartCard(title: "pH Eğilimi", lo: api.target.ph_min, hi: api.target.ph_max, color: Palette.green) { $0.ph }
                    chartCard(title: "EC Eğilimi", lo: api.target.ec_min, hi: api.target.ec_max, color: Palette.amber) { $0.ec }

                    manualDoseCard
                    alarmsCard
                    dosesCard
                }
                .padding()
            }
            .background(Palette.bg)
            .navigationTitle("Çilek Dozlama")
        }
    }

    private func chartCard(title: String, lo: Double, hi: Double, color: Color, value: @escaping (Reading) -> Double) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.subheadline).bold()
            Chart {
                ForEach(api.readings) { r in
                    LineMark(x: .value("#", r.id), y: .value(title, value(r)))
                        .foregroundStyle(color)
                        .interpolationMethod(.monotone)
                }
                RuleMark(y: .value("min", lo)).foregroundStyle(color.opacity(0.35)).lineStyle(.init(dash: [4]))
                RuleMark(y: .value("max", hi)).foregroundStyle(color.opacity(0.35)).lineStyle(.init(dash: [4]))
            }
            .chartYScale(domain: (lo - (hi - lo) - 0.2)...(hi + (hi - lo) + 0.2))
            .chartXAxis(.hidden)
            .frame(height: 150)
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.quaternary))
    }

    private var manualDoseCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Manuel Dozlama (+10 ml)").font(.subheadline).bold()
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 92))], spacing: 8) {
                ForEach(0..<5, id: \.self) { i in
                    Button { Task { await api.dose(i); await api.refresh() } } label: {
                        Text(COZ_AD[i]).font(.footnote).bold().frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(Palette.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(Palette.green)
                    }
                }
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.quaternary))
    }

    private var alarmsCard: some View {
        let active = api.alarms.filter { $0.durum == "AKTIF" }
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Aktif Alarmlar").font(.subheadline).bold()
                Spacer()
                Text("\(active.count)").font(.caption).bold()
                    .foregroundStyle(active.isEmpty ? Palette.green : Palette.red)
            }
            if active.isEmpty {
                Text("Aktif alarm yok.").font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(active) { a in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(a.turu).font(.footnote).bold().foregroundStyle(Palette.red)
                            Text(a.mesaj).font(.caption2).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Çöz") { Task { await api.resolve(a.id); await api.refresh() } }
                            .font(.caption).buttonStyle(.bordered).tint(Palette.green)
                    }
                }
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.quaternary))
    }

    private var dosesCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Son Dozlamalar").font(.subheadline).bold()
            if api.doses.isEmpty {
                Text("Kayıt yok.").font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(api.doses.prefix(6)) { d in
                    HStack {
                        Text(d.cozelti).font(.footnote)
                        Spacer()
                        Text("\(String(format: "%.0f", d.miktar_ml)) ml · \(d.tetik)")
                            .font(.caption).foregroundStyle(.secondary).monospacedDigit()
                    }
                    Divider()
                }
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.quaternary))
    }
}

// MARK: - Geçmiş
struct HistoryView: View {
    @EnvironmentObject var api: API
    var body: some View {
        NavigationStack {
            List {
                Section("Dozlama Geçmişi") {
                    ForEach(api.doses) { d in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(d.cozelti).font(.subheadline)
                                Text("\(d.oncesi, specifier: "%.2f") → \(d.sonrasi, specifier: "%.2f")")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                            VStack(alignment: .trailing) {
                                Text("\(d.miktar_ml, specifier: "%.0f") ml").monospacedDigit().font(.subheadline)
                                Text(d.tetik).font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                Section("Alarmlar") {
                    ForEach(api.alarms) { a in
                        HStack {
                            Text(a.turu).font(.subheadline)
                            Spacer()
                            Text(a.durum).font(.caption).bold()
                                .foregroundStyle(a.durum == "AKTIF" ? Palette.red : Palette.green)
                        }
                    }
                }
            }
            .navigationTitle("Geçmiş")
        }
    }
}

// MARK: - Ayarlar
struct SettingsView: View {
    @EnvironmentObject var api: API
    @State private var t = Target()
    @State private var saved = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Hub Adresi") {
                    TextField("http://192.168.4.1", text: $api.base)
                        .keyboardType(.URL).autocapitalization(.none).disableAutocorrection(true)
                    Text("Telefonu hub'ın \"CilekDozlama\" WiFi ağına bağlayın.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("Hedef Aralık (Sera 1)") {
                    stepperRow("pH alt", $t.ph_min, 3...8, 0.1)
                    stepperRow("pH üst", $t.ph_max, 3...8, 0.1)
                    stepperRow("EC alt", $t.ec_min, 0...4, 0.1)
                    stepperRow("EC üst", $t.ec_max, 0...4, 0.1)
                    Button {
                        Task { await api.saveTarget(t); await api.refresh(); saved = true }
                    } label: { Text("Hedefi Kaydet ve Düğüme Gönder").bold() }
                }
                if saved { Text("Kaydedildi ✓").foregroundStyle(Palette.green) }
            }
            .navigationTitle("Ayarlar")
            .onAppear { t = api.target }
        }
    }

    private func stepperRow(_ label: String, _ value: Binding<Double>, _ range: ClosedRange<Double>, _ step: Double) -> some View {
        Stepper(value: value, in: range, step: step) {
            HStack { Text(label); Spacer(); Text(String(format: "%.1f", value.wrappedValue)).monospacedDigit().foregroundStyle(.secondary) }
        }
    }
}
