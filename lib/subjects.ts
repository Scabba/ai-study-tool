// A lightweight, cost-free estimate of a quiz's subject, by keyword-matching the
// question text. It's a heuristic — good enough for a "Most common subject" stat,
// not perfect. (A more accurate version would ask the AI to tag each quiz.)

const SUBJECTS: { name: string; words: string[] }[] = [
  {
    name: "Biology",
    words: ["cell", "cellular", "dna", "rna", "gene", "genetic", "genome", "organism", "photosynthesis", "mitosis", "meiosis", "enzyme", "protein", "amino", "evolution", "species", "ecosystem", "ecology", "bacteria", "bacterial", "virus", "chromosome", "tissue", "membrane", "respiration", "neuron", "hormone", "metabolism", "biology", "biological", "ribosome", "mitochondria", "mitochondrion", "chloroplast", "nucleus", "organelle", "allele", "phenotype", "genotype", "cytoplasm", "homeostasis", "osmosis", "diffusion", "antibody", "antigen", "pathogen", "glucose", "lipid", "carbohydrate", "digestion", "circulatory", "vertebrate", "mammal", "reproduction", "adaptation", "chlorophyll", "predator"]
  },
  {
    name: "Chemistry",
    words: ["atom", "atomic", "molecule", "molecular", "compound", "element", "acid", "alkaline", "ion", "ionic", "electron", "proton", "neutron", "periodic", "chemical", "oxidation", "reduction", "mole", "molar", "solute", "solvent", "solution", "concentration", "catalyst", "chemistry", "valence", "isotope", "reactant", "reaction", "bond", "covalent"]
  },
  {
    name: "Physics",
    words: ["force", "velocity", "acceleration", "gravity", "momentum", "energy", "kinetic", "potential", "wave", "wavelength", "frequency", "voltage", "current", "circuit", "quantum", "physics", "newton", "thermodynamics", "friction", "magnetic", "electric", "electricity", "joule", "watt", "relativity", "refraction", "mass", "motion", "thermal"]
  },
  {
    name: "Math",
    words: ["equation", "algebra", "geometry", "calculus", "derivative", "integral", "theorem", "triangle", "polynomial", "fraction", "matrix", "arithmetic", "quadratic", "logarithm", "trigonometry", "sine", "cosine", "tangent", "coefficient", "factorial", "math", "mathematics", "numerator", "denominator", "integer", "exponent", "vector"]
  },
  {
    name: "Statistics",
    words: ["probability", "statistics", "statistical", "median", "variance", "deviation", "distribution", "regression", "correlation", "sample", "hypothesis", "percentile", "histogram"]
  },
  {
    name: "English",
    words: ["metaphor", "simile", "poem", "poetry", "novel", "grammar", "literature", "adjective", "adverb", "essay", "rhyme", "protagonist", "narrator", "syntax", "punctuation", "shakespeare", "stanza", "alliteration", "prose", "personification", "foreshadowing", "imagery"]
  },
  {
    name: "History",
    words: ["war", "empire", "revolution", "monarch", "president", "ancient", "treaty", "dynasty", "civilization", "historical", "history", "medieval", "colony", "colonial", "independence", "battle", "century", "renaissance", "feudal", "reign", "emperor", "conquest"]
  },
  {
    name: "Geography",
    words: ["continent", "capital", "river", "mountain", "climate", "ocean", "population", "latitude", "longitude", "geography", "terrain", "peninsula", "plateau", "hemisphere", "erosion", "tectonic", "desert", "glacier"]
  },
  {
    name: "Computer Science",
    words: ["algorithm", "programming", "software", "binary", "compiler", "database", "boolean", "recursion", "array", "variable", "javascript", "python", "byte", "processor", "encryption", "function", "iteration"]
  },
  {
    name: "Economics",
    words: ["economy", "economic", "economics", "market", "supply", "demand", "inflation", "gdp", "monetary", "fiscal", "currency", "revenue", "profit", "recession", "tariff", "capitalism"]
  },
  {
    name: "Psychology",
    words: ["behavior", "cognitive", "memory", "emotion", "psychology", "psychological", "perception", "conditioning", "personality", "disorder", "freud", "stimulus", "reinforcement", "subconscious"]
  },
  {
    name: "Philosophy",
    words: ["philosophy", "philosopher", "ethics", "metaphysics", "epistemology", "morality", "existential", "socrates", "aristotle", "plato", "utilitarian"]
  },
  {
    name: "Business",
    words: ["business", "marketing", "management", "entrepreneur", "finance", "accounting", "stakeholder", "brand", "corporate", "consumer", "investment"]
  },
  {
    name: "Astronomy",
    words: ["planet", "star", "galaxy", "orbit", "solar", "asteroid", "comet", "astronomy", "cosmic", "nebula", "supernova", "telescope", "constellation"]
  },
  {
    name: "Art",
    words: ["painting", "sculpture", "canvas", "palette", "impressionism", "artist", "portrait", "sketch", "cubism"]
  },
  {
    name: "Music",
    words: ["melody", "harmony", "rhythm", "chord", "octave", "symphony", "instrument", "composer", "musical", "crescendo"]
  },
  {
    name: "Spanish",
    words: ["spanish", "conjugate", "verbo", "gustar", "preterite", "subjunctive"]
  },
  {
    name: "French",
    words: ["french", "bonjour", "avoir", "passé", "féminin", "masculin"]
  }
];

// Best-guess subject for the given quiz text, or null if nothing scores enough.
export function classifySubject(text: string): string | null {
  const t = text.toLowerCase();
  let best: string | null = null;
  let bestScore = 0;
  for (const s of SUBJECTS) {
    let score = 0;
    for (const w of s.words) {
      // Match the word plus common plural forms (cell -> cells, virus -> viruses)
      const matches = t.match(new RegExp(`\\b${w}(?:s|es)?\\b`, "g"));
      if (matches) score += matches.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = s.name;
    }
  }
  return bestScore >= 2 ? best : null; // need a couple of hits to commit
}
