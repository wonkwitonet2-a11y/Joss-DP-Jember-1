import React, { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, HelpCircle, Heart, Plus, Sun, Info, Target, Settings, Zap, Droplet, Star, Smile, BookOpen } from "lucide-react";

type PKCategory = {
  id: string;
  title: string;
  tags: string[];
  gridColor: string;
  headerColor: string;
  icon: React.ReactNode;
  subtitle: string;
  description: string;
  tagTheme?: string;
  questions: { q: string; a: string }[];
};

const CATEGORIES: PKCategory[] = [
  {
    id: "pertanyaan_1",
    title: "10 Pertanyaan ke-1",
    tags: ["10 soal", "Mudah"],
    gridColor: "bg-rose-400/90",
    headerColor: "bg-red-500",
    icon: <HelpCircle className="w-16 h-16 absolute -bottom-4 -right-4 opacity-20" />,
    subtitle: "FAQ Seputar Yakult",
    description: "Pertanyaan yang sering ditanyakan",
    tagTheme: "bg-white/20 text-white",
    questions: [
      { q: "Bolehkah orang yang menderita maag minum Yakult?", a: "Boleh. Yakult aman diminum oleh orang sakit maag. Tetapi bila maag-nya parah disarankan konsultasi ke dokter." },
      { q: "Yakult boleh diminum mulai usia berapa?", a: "Yakult sudah boleh diminum sejak usia bayi yang sudah mendapat makanan tambahan, yaitu kira-kira usia 6 bulanan, dengan pemberian secara bertahap (sedikit-sedikit)." },
      { q: "Bolehkah penderita diabetes minum Yakult?", a: "Boleh. Yakult boleh diminum oleh penderita diabetes. Gula yang terkandung dalam Yakult sebesar 10g. Tetapi bila diabetesnya parah, disarankan konsultasi ke dokter." },
      { q: "Berapa botol minum Yakult setiap harinya?", a: "Minimal 1 botol secara rutin" },
      { q: "Apa beda Yakult dengan produk lain?", a: `Yakult yang saya tahu:\n1. Mengandung lebih dari 6,5 milyar bakteri L. casei Shirota strain yang mampu hidup sampai usus kita.\n2. Terbukti aman & bermanfaat memperbaiki sistem pencernaan.\n3. Tanpa bahan pengawet dan pewarna.\n4. Minuman Internasional yang sudah ada di 40 negara dan wilayah di dunia, diminum oleh lebih dari 40 juta orang setiap hari.` },
      { q: "Bolehkah ibu hamil/menyusui minum Yakult?", a: "Boleh. Yakult sangat dianjurkan diminum oleh ibu hamil, karena Yakult membantu menjaga keseimbangan bakteri usus untuk ibu hamil, sehingga membantu membentuk keseimbangan bakteri usus bayinya, serta membantu mengatasi susah buang air besar untuk ibu hamil." },
      { q: "Bolehkah orang diare minum Yakult?", a: "Boleh. Orang yang sedang diare tetap dianjurkan untuk minum Yakult karena Yakult dapat membantu memperbaiki sistem pencernaan dan meningkatkan daya tahan tubuh dan ini penting bagi penderita diare." },
      { q: "Adakah efek samping minum Yakult yang tidak dingin?", a: "Tidak ada efek samping, hanya rasanya lebih asam dan manfaatnya tidak maksimal." },
      { q: "Berapa lama masa kedaluwarsa Yakult?", a: "40 hari sejak diproduksi, tetapi harus disimpan dalam pendingin (0-10°C)." },
      { q: "Kapan waktu yang tepat minum Yakult?", a: "Yakult boleh diminum kapan saja, saat makan atau sesudah makan." }
    ]
  },
  {
    id: "pertanyaan_2",
    title: "10 Pertanyaan ke-2",
    tags: ["10 soal", "Lanjutan"],
    gridColor: "bg-indigo-500/90",
    headerColor: "bg-blue-600",
    icon: <Settings className="w-16 h-16 absolute -bottom-4 -right-4 opacity-20" />,
    subtitle: "FAQ Seputar Yakult",
    description: "Kenali lebih dalam tentang Yakult",
    tagTheme: "bg-white/20 text-white",
    questions: [
      { q: "Apakah Yakult itu?", a: "Yakult adalah minuman susu fermentasi yang baik untuk kesehatan. Satu botol Yakult berisi lebih dari 6,5 milyar bakteri L. casei Shirota strain hidup yang berguna untuk menjaga kesehatan usus kita." },
      { q: "Mengapa usus itu penting?", a: "Usus adalah tempat yang penting untuk menyerap gizi makanan yang kita perlukan untuk dapat terus hidup sehat. Dengan menciptakan usus yang sehat dan kuat, kita akan dapat menjaga kesehatan seluruh tubuh kita." },
      { q: "Apa manfaat Yakult?", a: `1. Membantu mencegah gangguan pencernaan.\n2. Membantu meningkatkan jumlah bakteri berguna dalam usus.\n3. Membantu menekan jumlah bakteri yang merugikan dalam usus.\n4. Membantu mengurangi racun dalam usus.\n5. Membantu meningkatkan daya tahan tubuh.` },
      { q: "Mengapa bakteri L. casei Shirota strain dapat mencapai usus kita dalam keadaan hidup?", a: "Karena bakteri L. casei Shirota strain kuat dan tahan terhadap asam lambung dan cairan empedu. Sehingga bisa sampai ke dalam usus kita dalam keadaan hidup dan dapat bermanfaat menjaga kesehatan usus kita." },
      { q: "Mengapa perlu minum Yakult setiap hari?", a: "Karena kita makan setiap hari, bakteri jahat juga masuk bersama-sama ke dalam usus kita. Selain itu, pola makan tidak seimbang, stress, minum obat-obatan, serta bertambahnya usia, juga akan mempengaruhi keseimbangan dalam usus kita. Karena itu, kita perlu minum Yakult setiap hari." },
      { q: "Apakah orang yang sedang minum obat juga boleh minum Yakult?", a: "Boleh. Terutama, apabila minum antibiotik, bakteri jahat dan baik yang di dalam usus kita berkurang. Sehingga dengan bakteri L. casei Shirota strain yang terdapat di dalam Yakult meningkatkan bakteri baik di dalam usus kita sampai pada kondisi normal." },
      { q: "Apakah orang dewasa perlu minum Yakult?", a: "Sangat perlu. Semakin bertambahnya usia, kemungkinan jumlah bakteri jahat meningkat dan daya tahan tubuh menurun. Dengan minum Yakult setiap hari dapat meningkatkan jumlah bakteri baik yang menjaga usus kita, serta daya tahan tubuh yang sudah menurun dapat meningkat kembali." },
      { q: "Mengapa Yakult rasanya asam?", a: "Karena Yakult adalah minuman susu fermentasi, dan rasa asamnya dihasilkan oleh proses fermentasi bakteri L. casei Shirota strain, hal ini bermanfaat untuk menekan jumlah bakteri jahat." },
      { q: "Mengapa dengan minum Yakult 1 botol sudah cukup?", a: "Karena dengan minum Yakult 1 botol setiap hari sudah cukup untuk menjaga kesehatan kita. Di dalam 1 botol Yakult terdapat lebih dari 6,5 milyar bakteri L. casei Shirota strain yang jumlahnya sudah cukup untuk dapat memperoleh manfaatnya." },
      { q: "Mengapa masa kedaluwarsa Yakult hanya 40 hari?", a: "Karena Yakult itu adalah minuman kesehatan yang dibuat secara higienis tanpa pengawet. Dalam 1 botol Yakult mengandung lebih dari 6,5 milyar bakteri hidup L. casei Shirota strain yang bermanfaat untuk kesehatan. Jika disimpan dalam keadaan dingin, masa kedaluwarsanya hanya 40 hari sejak tanggal produksi." }
    ]
  },
  {
    id: "cintai_ususmu",
    title: "Cintai Ususmu",
    tags: ["Edukasi", "Kesehatan"],
    gridColor: "bg-emerald-600/90",
    headerColor: "bg-green-700",
    icon: <Heart className="w-16 h-16 absolute -bottom-4 -right-4 opacity-20" />,
    subtitle: "Cintai Ususmu",
    description: "Kesehatan berawal dari usus yang sehat",
    tagTheme: "bg-white/20 text-white",
    questions: [
      { q: "Apa maksud \"Cintai Ususmu\"?", a: "Cintai ususmu adalah pesan baru dari Yakult yang berhubungan dengan kesehatan kita. Kesehatan kita berawal dari usus yang menyerap gizi yang diperlukan. Apabila usus kita sehat, maka kita pun bisa hidup dengan sehat. Untuk itu, minumlah Yakult dan cintailah usus kita." },
      { q: "Mengapa kita harus mencintai usus?", a: "Karena usus adalah organ yang sangat penting di dalam tubuh manusia. Usus menyerap gizi yang diperlukan, kemudian merubahnya menjadi energi, sehingga organ tubuh yang lain bisa bekerja dengan baik. Usus yang sehat, bisa selalu menyerap gizi dengan baik, sehingga tubuh akan menjadi kuat, tidak mudah sakit dan semoga kita berumur panjang dalam kondisi yang sehat. Untuk itu, marilah kita mencintai usus kita." },
      { q: "Bagaimana caranya mencintai usus kita?", a: "Dengan merawatnya setiap hari, misalkan makan & olahraga secara teratur. Pada saat makan, usus kitalah yang bekerja. Apabila kita makan tidak teratur, usus akan terganggu, sehingga kesehatan usus menurun. Tetapi untuk menjaga pola makan dan olahraga teratur, kadang-kadang susah dilakukan. Yakult bisa membantu menjaga usus kita, untuk itu mari cintai usus kita dengan minum Yakult setiap hari." },
      { q: "Apa bukti dengan minum Yakult setiap hari, usus menjadi sehat?", a: "BAB yang baik merupakan tanda usus yang sehat. Hal ini karena bakteri baik yaitu bakteri L. casei Shirota strain yang ada di dalam Yakult menekan pertumbuhan bakteri jahat di dalam usus, sehingga usus bisa menyerap gizi dengan baik dan membuat kondisi usus sehat. Karena itu, dengan meminum Yakult setiap hari, maka semakin banyak bakteri L. casei Shirota strain yang masuk ke dalam usus dan membuat usus menjadi sehat. Mari cintai usus kita dengan minum Yakult setiap hari." },
      { q: "Berapa lama saya minum Yakult agar usus menjadi sehat?", a: "Dengan menjadikan minum Yakult 1 botol setiap hari sebagai kebiasaan, kesehatan usus dapat terjaga. Mari cintai usus kita dengan minum Yakult setiap hari." }
    ]
  },
  {
    id: "pertanyaan_tambahan",
    title: "10 Pertanyaan Tambahan",
    tags: ["Bonus", "Senin"],
    gridColor: "bg-purple-600/80",
    headerColor: "bg-sky-500",
    icon: <Plus className="w-20 h-20 absolute -bottom-4 -right-4 opacity-20" />,
    subtitle: "Fakta Menarik Yakult",
    description: "Hal-hal yang perlu kamu tahu tentang Yakult",
    tagTheme: "bg-white/20 text-white",
    questions: [
      { q: "Siapa penemu bakteri Yakult?", a: "Penemu bakteri yakult adalah Dr. Minoru Shirota." },
      { q: "Sejak kapan Yakult dipasarkan?", a: `- Di Jepang: tahun 1935\n- Di Indonesia: tahun 1931` },
      { q: "Di mana letak/lokasi pabrik PT Yakult Indonesia Persada?", a: `- Lokasi Pertama: di Sukabumi, Jawa Barat\n- Lokasi Kedua: di Mojokerto, Jawa Timur (mulai produksi Januari 2014)` },
      { q: "Bagaimana warna Yakult terbentuk?", a: "Warna Yakult terbentuk dari proses produksi, pada tahap pemanasan susu bubuk skim (tanpa lemak) dan dekstrosa (sari pati singkong) yang bertujuan untuk menumbuhkan kuman dari luar." },
      { q: "Apa arti fermentasi?", a: "Fermentasi adalah salah satu proses pengawetan bahan makanan dengan memanfaatkan bakteri berguna untuk menghasilkan produk yang diinginkan." },
      { q: "Kenapa bentuk botol Yakult unik?", a: "Bentuk botol Yakult unik karena memiliki pinggang yang mudah dipegang dan tidak licin, sehingga saat diminum akan mengalir perlahan-lahan dan peminumnya tidak tersedak." },
      { q: "Berapa berat (kg) bakteri di tubuh manusia?", a: "Berat bakteri usus di tubuh manusia dewasa adalah 1-1,5 kg." },
      { q: "Berapa panjang usus manusia?", a: `Usus besar: ±1,5 meter (sama dengan tinggi tubuh)\nUsus kecil: ±6 meter (±4x tinggi tubuh)` },
      { q: "Di mana Yakult bekerja di tubuh manusia?", a: "Bakteri Yakult bekerja di usus untuk membantu pencernaan tetap baik." },
      { q: "Apa yang dimaksud Probiotik?", a: "Probiotik adalah sekumpulan bakteri baik yang jika dikonsumsi terbukti dapat sampai ke usus dalam keadaan hidup dan bermanfaat." }
    ]
  },
  {
    id: "yakult_light",
    title: "Info Yakult Light",
    tags: ["Rendah gula"],
    gridColor: "bg-amber-500/90",
    headerColor: "bg-blue-800",
    icon: <Sun className="w-16 h-16 absolute -bottom-4 -right-4 opacity-20" />,
    subtitle: "Tanya Jawab Yakult Light",
    description: "7 pertanyaan seputar Yakult Light",
    tagTheme: "bg-white/20 text-white",
    questions: [
      { q: "Mengapa Yakult Light lebih sedikit gula daripada Yakult Original tetapi lebih mahal?", a: "Sesuai target produk rendah kalori namun tetap memberikan rasa manis yang mirip dengan Yakult Original, sehingga terdapat beberapa penambahan bahan baku pada Yakult Light yang berkualitas tinggi standar Yakult International, seperti pemanis alami berupa stevia dan maltitol ditambah Vitamin D dan Vitamin E." },
      { q: "Mengapa ada penambahan Vitamin D dan E? Lalu, apa manfaat dari Vitamin D dan E?", a: "Vitamin D & E adalah bagian vitamin yang dibutuhkan oleh tubuh. Manfaat Vitamin D adalah untuk kesehatan tulang dan gigi. Vitamin E baik untuk kulit, mata dan saraf serta memiliki antioksidan yang tinggi." },
      { q: "Berapa banyak kandungan gula dalam Yakult Original dan Yakult Light?", a: "Yakult Original mengandung gula sebesar 10 gram atau setara 1 buah pisang ukuran sedang. Yakult Light mengandung gula sebesar 3 gram. Keduanya aman dikonsumsi semua orang." },
      { q: "Bolehkah penderita diabetes minum Yakult Light?", a: "Boleh. Setiap botol Yakult Light mengandung kalori lebih rendah dan bisa dikonsumsi oleh penderita diabetes. Namun apabila diabetesnya parah disarankan konsultasi dulu dengan dokter." },
      { q: "Bolehkah anak-anak juga minum Yakult Light?", a: "Boleh. Anak-anak atau orang dewasa boleh mengonsumsinya karena bakteri LcS sangat dibutuhkan tubuh agar pencernaan selalu terjaga dalam keadaan baik." },
      { q: "Apakah penderita maag boleh minum Yakult Light?", a: "Boleh, Yakult Light aman diminum oleh penderita maag. Tetapi bila maag-nya parah, disarankan untuk konsultasi ke dokter." },
      { q: "Apakah boleh minum Yakult Light lebih dari 1 botol per hari?", a: "Boleh, namun agar mendapatkan manfaatnya kami sarankan untuk konsumsi setiap hari secara rutin." }
    ]
  },
  {
    id: "yakult_mangga",
    title: "Yakult Rasa Mangga",
    tags: ["Baru"],
    gridColor: "bg-[#d893a3]", // A muted pinkish tone matching the grid
    headerColor: "bg-gradient-to-br from-amber-400 to-amber-500",
    icon: <Droplet className="w-16 h-16 absolute -bottom-4 -right-4 opacity-20" />,
    subtitle: "Segar & Bernutrisi",
    description: "Dengan Vitamin D & Bakteri LcS",
    tagTheme: "bg-white/20 text-white",
    questions: [
      { q: "Mengapa pilihannya menggunakan Rasa Mangga?", a: "Karena buah mangga menjadi salah satu buah yang familiar dan banyak disukai masyarakat Indonesia, sehingga bisa memberikan pilihan rasa untuk mendapatkan manfaat dari bakteri LcS." },
      { q: "Yakult rasa Mangga menggunakan rasa dari Mangga murni atau buatan?", a: "Yakult rasa Mangga menggunakan perisa identik alami dari buah mangga yang aman dikonsumsi." },
      { q: "Apa beda Yakult rasa Mangga dengan Yakult Original dan Light?", a: "Yakult rasa Mangga sama dengan Yakult Original, tetapi ada rasa Mangga dan penambahan Vitamin D namun secara manfaat bakteri-nya tetap sama." },
      { q: "Bolehkah ibu Hamil atau Menyusui minum Yakult?", a: "Boleh, Yakult sangat dianjurkan diminum oleh ibu Hamil atau menyusui karena Yakult membantu menjaga keseimbangan bakteri usus ibu hamil, sehingga membantu membentuk keseimbangan bakteri usus bayinya, serta membantu mengatasi susah buang air besar untuk ibu Hamil." }
    ]
  },
  {
    id: "yakult_stroberi",
    title: "QnA Yakult Stroberi",
    tags: ["Baru", "Flip Card"],
    gridColor: "bg-pink-600/90",
    headerColor: "bg-pink-700",
    icon: <Star className="w-16 h-16 absolute -bottom-4 -right-4 opacity-20" />,
    subtitle: "Kenalan Sama Rasa Stroberi",
    description: "Tap kartu untuk lihat jawaban lengkapnya",
    tagTheme: "bg-white/20 text-white",
    questions: [
      { q: "Kenapa Yakult rasa Stroberi?", a: `Terima kasih Bapak/Ibu sudah rutin mengonsumsi Yakult.\n\nVarian Rasa Stroberi dihadirkan karena:\n\n1. Berdasarkan hasil survei, terdapat permintaan yang tinggi dari pelanggan terhadap varian rasa stroberi.\n\n2. Stroberi merupakan rasa buah yang disukai oleh semua usia.` }
    ]
  },
  {
    id: "edukasi_probiotik",
    title: "Hafalan Probiotik",
    tags: ["Flashcard", "6 soal"],
    gridColor: "bg-blue-600/90",
    headerColor: "bg-emerald-800",
    icon: <BookOpen className="w-16 h-16 absolute -bottom-4 -right-4 opacity-20" />,
    subtitle: "Sahabat Probiotikmu",
    description: "Kenali si baik yang bekerja untuk pencernaanmu",
    tagTheme: "bg-white/20 text-white",
    questions: [
      { q: "Apa yang dimaksud dengan Probiotik?", a: `Probiotik merupakan bakteri baik yang hidup.\n\nApabila dikonsumsi dalam jumlah yang cukup terbukti dapat memberi manfaat kesehatan.` },
      { q: "Kenapa Yakult merupakan minuman Probiotik?", a: "Karena bakteri baik LcS yang hidup terbukti aman untuk dikonsumsi dan memberikan manfaat bagi kesehatan, sehingga mendapatkan sertifikat BPOM RI secara resmi sebagai produk Probiotik pertama di Indonesia." },
      { q: "Apakah semua bakteri baik merupakan Probiotik?", a: "Tidak, bakteri disebut sebagai Probiotik jika terbukti secara ilmiah aman dan memberikan manfaat bagi kesehatan. LcS tetap HIDUP dan AKTIF ketika sampai di usus, sehingga dapat memberikan manfaat kesehatan bagi tubuh secara maksimal." },
      { q: "Apa manfaat utama Probiotik bagi tubuh?", a: "Probiotik membantu menjaga keseimbangan bakteri usus, sehingga kesehatan pencernaan dan daya tahan tubuh dapat terjaga." },
      { q: "Apakah ada efek samping dari konsumsi Probiotik setiap hari?", a: "Tidak ada efek samping, karena Probiotik terbukti aman untuk dikonsumsi setiap hari dan memberikan manfaat bagi kesehatan." },
      { q: "Mengapa kita perlu mengonsumsi Probiotik?", a: "Karena setiap hari banyak bakteri yang masuk ke dalam tubuh, Probiotik dapat membantu menjaga keseimbangan bakteri baik di saluran pencernaan sehingga dapat mencegah gangguan kesehatan." }
    ]
  }
];

export default function ProductKnowledgeView({ theme, onBack }: { theme?: string, onBack?: () => void }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const activeCategory = CATEGORIES.find(c => c.id === selectedCategory);

  if (activeCategory) {
    return (
      <div className="flex flex-col h-full bg-slate-50 relative z-[100]">
        {/* Header */}
        <div className={`p-6 ${activeCategory.headerColor} text-white flex-shrink-0 relative overflow-hidden shadow-md`}>
          <div className="absolute right-0 top-0 opacity-10 scale-150 transform translate-x-4 -translate-y-4">
            {activeCategory.icon}
          </div>
          <div className="flex items-center gap-4 relative z-10">
            <button onClick={() => { setSelectedCategory(null); setExpandedId(null); }} className="p-2 hover:bg-white/20 rounded-full transition-colors -ml-2">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold">{activeCategory.title}</h1>
          </div>
          <div className="mt-6 relative z-10">
            <div className="inline-block bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold mb-3">
              {activeCategory.tags.join(" • ")}
            </div>
            <h2 className="text-2xl font-black mb-1">{activeCategory.subtitle}</h2>
            <p className="text-white/80 text-sm">{activeCategory.description}</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 pb-32">
          <div className="space-y-3 max-w-lg mx-auto">
            {activeCategory.questions.map((q, idx) => {
              const isExpanded = expandedId === idx;
              
              // Only for Yakult Stroberi, we do a flip card style, but since it's an accordion in others, 
              // let's just use accordion for all to be simple, but with colorful numbers
              const numColors = [
                "text-red-600 bg-red-100",
                "text-blue-600 bg-blue-100",
                "text-emerald-600 bg-emerald-100",
                "text-purple-600 bg-purple-100",
                "text-amber-600 bg-amber-100",
                "text-pink-600 bg-pink-100",
                "text-rose-600 bg-rose-100",
                "text-sky-600 bg-sky-100",
              ];
              const badgeColor = numColors[idx % numColors.length];

              return (
                <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden transition-all duration-200">
                  <button 
                    onClick={() => setExpandedId(isExpanded ? null : idx)}
                    className="w-full text-left p-4 flex items-start gap-3 focus:outline-none"
                  >
                    <div className={`w-8 h-8 rounded-lg ${badgeColor} flex items-center justify-center font-bold text-sm shrink-0`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="font-semibold text-slate-800 text-[15px] pr-2">{q.q}</p>
                    </div>
                    <div className="shrink-0 pt-1">
                      {isExpanded ? (
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                          <ChevronUp className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1">
                      <div className="pl-11 relative">
                        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-blue-500 rounded-full" />
                        <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                          {q.a}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 relative z-[100]">
      <div className="bg-rose-500 text-white p-4 flex items-center gap-3 shadow-md flex-shrink-0">
        {onBack && (
          <button onClick={onBack} className="p-2 hover:bg-white/20 rounded-full transition-colors -ml-2">
            <ArrowLeft className="w-6 h-6" />
          </button>
        )}
        <h1 className="text-lg font-bold">Product Knowledge</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-32">
        <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`${c.gridColor} rounded-2xl p-4 text-left relative overflow-hidden shadow-sm hover:shadow-md hover:scale-[1.02] transition-all aspect-[4/5] flex flex-col justify-center focus:outline-none`}
            >
              {c.icon}
              <div className="relative z-10 flex-1 flex flex-col justify-center">
                <h3 className="text-white font-bold text-[17px] leading-tight mb-3">
                  {c.title}
                </h3>
                <div className="flex flex-wrap gap-1.5 mt-auto">
                  {c.tags.map(tag => (
                    <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full ${c.tagTheme || 'bg-white/20 text-white'}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
