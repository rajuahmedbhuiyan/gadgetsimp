/**
 * Bangladesh administrative areas, and what delivery costs to reach them.
 *
 * The 64 districts with their upazilas, grouped by division so the pickers can
 * show a heading. Static data rather than an endpoint: it changes about once a
 * decade, and a network round trip between picking a district and being
 * allowed to pick an upazila would be a poor trade.
 */

export interface District {
  name: string;
  division: string;
  upazilas: string[];
}

export const DISTRICTS: readonly District[] = [
  /* ------------------------------- Barishal ------------------------------- */
  {
    name: "Barguna",
    division: "Barishal",
    upazilas: ["Amtali", "Bamna", "Barguna Sadar", "Betagi", "Patharghata", "Taltali"],
  },
  {
    name: "Barishal",
    division: "Barishal",
    upazilas: [
      "Agailjhara", "Babuganj", "Bakerganj", "Banaripara", "Barishal Sadar",
      "Gaurnadi", "Hizla", "Mehendiganj", "Muladi", "Wazirpur",
    ],
  },
  {
    name: "Bhola",
    division: "Barishal",
    upazilas: ["Bhola Sadar", "Burhanuddin", "Char Fasson", "Daulatkhan", "Lalmohan", "Manpura", "Tazumuddin"],
  },
  {
    name: "Jhalokati",
    division: "Barishal",
    upazilas: ["Jhalokati Sadar", "Kathalia", "Nalchity", "Rajapur"],
  },
  {
    name: "Patuakhali",
    division: "Barishal",
    upazilas: ["Bauphal", "Dashmina", "Dumki", "Galachipa", "Kalapara", "Mirzaganj", "Patuakhali Sadar", "Rangabali"],
  },
  {
    name: "Pirojpur",
    division: "Barishal",
    upazilas: ["Bhandaria", "Kawkhali", "Mathbaria", "Nazirpur", "Nesarabad", "Pirojpur Sadar", "Zianagar"],
  },

  /* ------------------------------ Chattogram ------------------------------ */
  {
    name: "Bandarban",
    division: "Chattogram",
    upazilas: ["Alikadam", "Bandarban Sadar", "Lama", "Naikhongchhari", "Rowangchhari", "Ruma", "Thanchi"],
  },
  {
    name: "Brahmanbaria",
    division: "Chattogram",
    upazilas: [
      "Akhaura", "Ashuganj", "Bancharampur", "Bijoynagar", "Brahmanbaria Sadar",
      "Kasba", "Nabinagar", "Nasirnagar", "Sarail",
    ],
  },
  {
    name: "Chandpur",
    division: "Chattogram",
    upazilas: ["Chandpur Sadar", "Faridganj", "Haimchar", "Haziganj", "Kachua", "Matlab Dakshin", "Matlab Uttar", "Shahrasti"],
  },
  {
    name: "Chattogram",
    division: "Chattogram",
    upazilas: [
      "Anwara", "Banshkhali", "Boalkhali", "Chandanaish", "Fatikchhari", "Hathazari",
      "Karnaphuli", "Lohagara", "Mirsharai", "Patiya", "Rangunia", "Raozan",
      "Sandwip", "Satkania", "Sitakunda",
    ],
  },
  {
    name: "Cox's Bazar",
    division: "Chattogram",
    upazilas: ["Chakaria", "Cox's Bazar Sadar", "Kutubdia", "Maheshkhali", "Pekua", "Ramu", "Teknaf", "Ukhia"],
  },
  {
    name: "Cumilla",
    division: "Chattogram",
    upazilas: [
      "Barura", "Brahmanpara", "Burichang", "Chandina", "Chauddagram", "Cumilla Adarsha Sadar",
      "Cumilla Sadar Dakshin", "Daudkandi", "Debidwar", "Homna", "Laksam", "Meghna",
      "Monohorgonj", "Muradnagar", "Nangalkot", "Titas",
    ],
  },
  {
    name: "Feni",
    division: "Chattogram",
    upazilas: ["Chhagalnaiya", "Daganbhuiyan", "Feni Sadar", "Fulgazi", "Parshuram", "Sonagazi"],
  },
  {
    name: "Khagrachhari",
    division: "Chattogram",
    upazilas: ["Dighinala", "Khagrachhari Sadar", "Lakshmichhari", "Mahalchhari", "Manikchhari", "Matiranga", "Panchhari", "Ramgarh"],
  },
  {
    name: "Lakshmipur",
    division: "Chattogram",
    upazilas: ["Kamalnagar", "Lakshmipur Sadar", "Raipur", "Ramganj", "Ramgati"],
  },
  {
    name: "Noakhali",
    division: "Chattogram",
    upazilas: ["Begumganj", "Chatkhil", "Companiganj", "Hatiya", "Kabirhat", "Noakhali Sadar", "Senbagh", "Sonaimuri", "Subarnachar"],
  },
  {
    name: "Rangamati",
    division: "Chattogram",
    upazilas: [
      "Baghaichhari", "Barkal", "Belaichhari", "Juraichhari", "Kaptai", "Kawkhali",
      "Langadu", "Naniarchar", "Rajasthali", "Rangamati Sadar",
    ],
  },

  /* -------------------------------- Dhaka --------------------------------- */
  {
    name: "Dhaka",
    division: "Dhaka",
    upazilas: ["Dhamrai", "Dohar", "Keraniganj", "Nawabganj", "Savar", "Dhaka Metropolitan"],
  },
  {
    name: "Faridpur",
    division: "Dhaka",
    upazilas: ["Alfadanga", "Bhanga", "Boalmari", "Charbhadrasan", "Faridpur Sadar", "Madhukhali", "Nagarkanda", "Sadarpur", "Saltha"],
  },
  {
    name: "Gazipur",
    division: "Dhaka",
    upazilas: ["Gazipur Sadar", "Kaliakair", "Kaliganj", "Kapasia", "Sreepur"],
  },
  {
    name: "Gopalganj",
    division: "Dhaka",
    upazilas: ["Gopalganj Sadar", "Kashiani", "Kotalipara", "Muksudpur", "Tungipara"],
  },
  {
    name: "Kishoreganj",
    division: "Dhaka",
    upazilas: [
      "Austagram", "Bajitpur", "Bhairab", "Hossainpur", "Itna", "Karimganj",
      "Katiadi", "Kishoreganj Sadar", "Kuliarchar", "Mithamain", "Nikli", "Pakundia", "Tarail",
    ],
  },
  {
    name: "Madaripur",
    division: "Dhaka",
    upazilas: ["Kalkini", "Madaripur Sadar", "Rajoir", "Shibchar", "Dasar"],
  },
  {
    name: "Manikganj",
    division: "Dhaka",
    upazilas: ["Daulatpur", "Ghior", "Harirampur", "Manikganj Sadar", "Saturia", "Shivalaya", "Singair"],
  },
  {
    name: "Munshiganj",
    division: "Dhaka",
    upazilas: ["Gazaria", "Lohajang", "Munshiganj Sadar", "Sirajdikhan", "Sreenagar", "Tongibari"],
  },
  {
    name: "Narayanganj",
    division: "Dhaka",
    upazilas: ["Araihazar", "Bandar", "Narayanganj Sadar", "Rupganj", "Sonargaon"],
  },
  {
    name: "Narsingdi",
    division: "Dhaka",
    upazilas: ["Belabo", "Monohardi", "Narsingdi Sadar", "Palash", "Raipura", "Shibpur"],
  },
  {
    name: "Rajbari",
    division: "Dhaka",
    upazilas: ["Baliakandi", "Goalandaghat", "Kalukhali", "Pangsha", "Rajbari Sadar"],
  },
  {
    name: "Shariatpur",
    division: "Dhaka",
    upazilas: ["Bhedarganj", "Damudya", "Gosairhat", "Naria", "Shariatpur Sadar", "Zanjira"],
  },
  {
    name: "Tangail",
    division: "Dhaka",
    upazilas: [
      "Basail", "Bhuapur", "Delduar", "Dhanbari", "Ghatail", "Gopalpur",
      "Kalihati", "Madhupur", "Mirzapur", "Nagarpur", "Sakhipur", "Tangail Sadar",
    ],
  },

  /* -------------------------------- Khulna -------------------------------- */
  {
    name: "Bagerhat",
    division: "Khulna",
    upazilas: ["Bagerhat Sadar", "Chitalmari", "Fakirhat", "Kachua", "Mollahat", "Mongla", "Morrelganj", "Rampal", "Sarankhola"],
  },
  {
    name: "Chuadanga",
    division: "Khulna",
    upazilas: ["Alamdanga", "Chuadanga Sadar", "Damurhuda", "Jibannagar"],
  },
  {
    name: "Jashore",
    division: "Khulna",
    upazilas: ["Abhaynagar", "Bagherpara", "Chaugachha", "Jashore Sadar", "Jhikargachha", "Keshabpur", "Manirampur", "Sharsha"],
  },
  {
    name: "Jhenaidah",
    division: "Khulna",
    upazilas: ["Harinakunda", "Jhenaidah Sadar", "Kaliganj", "Kotchandpur", "Maheshpur", "Shailkupa"],
  },
  {
    name: "Khulna",
    division: "Khulna",
    upazilas: ["Batiaghata", "Dacope", "Dighalia", "Dumuria", "Koyra", "Paikgachha", "Phultala", "Rupsha", "Terokhada", "Khulna Metropolitan"],
  },
  {
    name: "Kushtia",
    division: "Khulna",
    upazilas: ["Bheramara", "Daulatpur", "Khoksa", "Kumarkhali", "Kushtia Sadar", "Mirpur"],
  },
  {
    name: "Magura",
    division: "Khulna",
    upazilas: ["Magura Sadar", "Mohammadpur", "Shalikha", "Sreepur"],
  },
  {
    name: "Meherpur",
    division: "Khulna",
    upazilas: ["Gangni", "Meherpur Sadar", "Mujibnagar"],
  },
  {
    name: "Narail",
    division: "Khulna",
    upazilas: ["Kalia", "Lohagara", "Narail Sadar"],
  },
  {
    name: "Satkhira",
    division: "Khulna",
    upazilas: ["Assasuni", "Debhata", "Kalaroa", "Kaliganj", "Satkhira Sadar", "Shyamnagar", "Tala"],
  },

  /* ------------------------------ Mymensingh ------------------------------ */
  {
    name: "Jamalpur",
    division: "Mymensingh",
    upazilas: ["Bakshiganj", "Dewanganj", "Islampur", "Jamalpur Sadar", "Madarganj", "Melandaha", "Sarishabari"],
  },
  {
    name: "Mymensingh",
    division: "Mymensingh",
    upazilas: [
      "Bhaluka", "Dhobaura", "Fulbaria", "Gaffargaon", "Gauripur", "Haluaghat",
      "Ishwarganj", "Muktagachha", "Mymensingh Sadar", "Nandail", "Phulpur", "Tarakanda", "Trishal",
    ],
  },
  {
    name: "Netrokona",
    division: "Mymensingh",
    upazilas: ["Atpara", "Barhatta", "Durgapur", "Kalmakanda", "Kendua", "Khaliajuri", "Madan", "Mohanganj", "Netrokona Sadar", "Purbadhala"],
  },
  {
    name: "Sherpur",
    division: "Mymensingh",
    upazilas: ["Jhenaigati", "Nakla", "Nalitabari", "Sherpur Sadar", "Sreebardi"],
  },

  /* ------------------------------- Rajshahi ------------------------------- */
  {
    name: "Bogura",
    division: "Rajshahi",
    upazilas: [
      "Adamdighi", "Bogura Sadar", "Dhunat", "Dhupchanchia", "Gabtali", "Kahaloo",
      "Nandigram", "Sariakandi", "Shajahanpur", "Sherpur", "Shibganj", "Sonatala",
    ],
  },
  {
    name: "Chapainawabganj",
    division: "Rajshahi",
    upazilas: ["Bholahat", "Chapainawabganj Sadar", "Gomastapur", "Nachole", "Shibganj"],
  },
  {
    name: "Joypurhat",
    division: "Rajshahi",
    upazilas: ["Akkelpur", "Joypurhat Sadar", "Kalai", "Khetlal", "Panchbibi"],
  },
  {
    name: "Naogaon",
    division: "Rajshahi",
    upazilas: [
      "Atrai", "Badalgachhi", "Dhamoirhat", "Manda", "Mahadebpur", "Naogaon Sadar",
      "Niamatpur", "Patnitala", "Porsha", "Raninagar", "Sapahar",
    ],
  },
  {
    name: "Natore",
    division: "Rajshahi",
    upazilas: ["Bagatipara", "Baraigram", "Gurudaspur", "Lalpur", "Naldanga", "Natore Sadar", "Singra"],
  },
  {
    name: "Pabna",
    division: "Rajshahi",
    upazilas: ["Atgharia", "Bera", "Bhangura", "Chatmohar", "Faridpur", "Ishwardi", "Pabna Sadar", "Santhia", "Sujanagar"],
  },
  {
    name: "Rajshahi",
    division: "Rajshahi",
    upazilas: ["Bagha", "Bagmara", "Charghat", "Durgapur", "Godagari", "Mohanpur", "Paba", "Puthia", "Tanore", "Rajshahi Metropolitan"],
  },
  {
    name: "Sirajganj",
    division: "Rajshahi",
    upazilas: ["Belkuchi", "Chauhali", "Kamarkhanda", "Kazipur", "Raiganj", "Shahjadpur", "Sirajganj Sadar", "Tarash", "Ullapara"],
  },

  /* -------------------------------- Rangpur ------------------------------- */
  {
    name: "Dinajpur",
    division: "Rangpur",
    upazilas: [
      "Birampur", "Birganj", "Biral", "Bochaganj", "Chirirbandar", "Dinajpur Sadar",
      "Ghoraghat", "Hakimpur", "Kaharole", "Khansama", "Nawabganj", "Parbatipur", "Phulbari",
    ],
  },
  {
    name: "Gaibandha",
    division: "Rangpur",
    upazilas: ["Fulchhari", "Gaibandha Sadar", "Gobindaganj", "Palashbari", "Sadullapur", "Saghata", "Sundarganj"],
  },
  {
    name: "Kurigram",
    division: "Rangpur",
    upazilas: ["Bhurungamari", "Char Rajibpur", "Chilmari", "Fulbari", "Kurigram Sadar", "Nageshwari", "Rajarhat", "Raomari", "Ulipur"],
  },
  {
    name: "Lalmonirhat",
    division: "Rangpur",
    upazilas: ["Aditmari", "Hatibandha", "Kaliganj", "Lalmonirhat Sadar", "Patgram"],
  },
  {
    name: "Nilphamari",
    division: "Rangpur",
    upazilas: ["Dimla", "Domar", "Jaldhaka", "Kishoreganj", "Nilphamari Sadar", "Saidpur"],
  },
  {
    name: "Panchagarh",
    division: "Rangpur",
    upazilas: ["Atwari", "Boda", "Debiganj", "Panchagarh Sadar", "Tetulia"],
  },
  {
    name: "Rangpur",
    division: "Rangpur",
    upazilas: ["Badarganj", "Gangachhara", "Kaunia", "Mithapukur", "Pirgachha", "Pirganj", "Rangpur Sadar", "Taraganj"],
  },
  {
    name: "Thakurgaon",
    division: "Rangpur",
    upazilas: ["Baliadangi", "Haripur", "Pirganj", "Ranisankail", "Thakurgaon Sadar"],
  },

  /* -------------------------------- Sylhet -------------------------------- */
  {
    name: "Habiganj",
    division: "Sylhet",
    upazilas: ["Ajmiriganj", "Bahubal", "Baniyachong", "Chunarughat", "Habiganj Sadar", "Lakhai", "Madhabpur", "Nabiganj", "Shayestaganj"],
  },
  {
    name: "Moulvibazar",
    division: "Sylhet",
    upazilas: ["Barlekha", "Juri", "Kamalganj", "Kulaura", "Moulvibazar Sadar", "Rajnagar", "Sreemangal"],
  },
  {
    name: "Sunamganj",
    division: "Sylhet",
    upazilas: [
      "Bishwambharpur", "Chhatak", "Derai", "Dharampasha", "Dowarabazar", "Jagannathpur",
      "Jamalganj", "Sullah", "Sunamganj Sadar", "Tahirpur", "Madhyanagar", "Shantiganj",
    ],
  },
  {
    name: "Sylhet",
    division: "Sylhet",
    upazilas: [
      "Balaganj", "Beanibazar", "Bishwanath", "Companiganj", "Dakshin Surma", "Fenchuganj",
      "Golapganj", "Gowainghat", "Jaintiapur", "Kanaighat", "Osmani Nagar", "Sylhet Sadar", "Zakiganj",
    ],
  },
] as const;

/**
 * Names only, alphabetical, for the district picker.
 *
 * Sorted here rather than in the literal above, which stays grouped by
 * division so it can be read and corrected against a map. `localeCompare`
 * rather than `<`, so `Cox's Bazar` lands where a reader expects it.
 */
export const DISTRICT_NAMES: readonly string[] = DISTRICTS.map((d) => d.name)
  .slice()
  .sort((a, b) => a.localeCompare(b));

/** Alphabetical too - a picker is scanned, not read in administrative order. */
export function upazilasFor(district: string): readonly string[] {
  const found = DISTRICTS.find((entry) => entry.name === district);
  return found ? found.upazilas.slice().sort((a, b) => a.localeCompare(b)) : [];
}

/**
 * Where most orders go, so the picker opens on it and the delivery quote is
 * right without anyone touching the field.
 */
export const DEFAULT_DISTRICT = "Dhaka";

export function isKnownDistrict(value: string) {
  return DISTRICTS.some((entry) => entry.name === value);
}

/* ------------------------------- delivery -------------------------------- */

/**
 * What delivery costs, by district.
 *
 * Inside Dhaka the courier is a same-city rider; everywhere else is an
 * intercity parcel, hence the flat split.
 *
 * ⚠️ The server currently returns `shippingFee: 0` for every order
 * (`order.service.js` -> `shippingFeeFor()`), and it will not accept a fee
 * from the client - by design, since prices must never come from a browser.
 * So this figure is what the checkout *quotes*; the placed order will not
 * include it until the same rule is implemented server-side.
 */
export const DELIVERY_FEE_DHAKA = 70;
export const DELIVERY_FEE_OUTSIDE = 130;

export function deliveryFeeFor(district: string | undefined) {
  if (!district) return null;
  return district === "Dhaka" ? DELIVERY_FEE_DHAKA : DELIVERY_FEE_OUTSIDE;
}
