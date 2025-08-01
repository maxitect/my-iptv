const fs = require("fs");

// Manual high-quality mappings for major French channels
const manualMappings = {
  TF1: "TF1.fr",
  "TF1 HD": "TF1.fr",
  "France 2": "France2.fr",
  "France 2 HD": "France2.fr",
  "France 3": "France3.fr",
  "France 3 HD": "France3.fr",
  "France 4": "France4.fr",
  "France 4 HD": "France4.fr",
  "France 5": "France5.fr",
  "France 5 HD": "France5.fr",
  M6: "M6.fr",
  Arte: "Arte.fr",
  "BFM TV": "BFMTV.fr",
  BFMTV: "BFMTV.fr",
  CNews: "CNews.fr",
  CNEWS: "CNews.fr",
  LCI: "LCI.fr",
  "RMC Story": "RMCStory.fr",
  "RMC Découverte": "RMCDecouverte.fr",
  W9: "W9.fr",
  TMC: "TMC.fr",
  NT1: "NT1.fr",
  "NRJ 12": "NRJ12.fr",
  "Canal+": "CanalPlus.fr",
  "Canal+ France": "CanalPlus.fr",
  Euronews: "EuronewsFrench.fr",
  "France 24": "France24.fr",
  "France 24 French": "France24.fr",
  TV5Monde: "TV5MondeFranceBelgiqueSuisseMonaco.fr",
  Gulli: "Gulli.fr",
  "L'Equipe": "LEquipe.fr",
  "Cherie 25": "Cherie25.fr",
  "Chérie 25": "Cherie25.fr",
  "6ter": "6ter.fr",
};

// Parse M3U and apply manual mappings
function parseM3U(content) {
  const lines = content.split("\n");
  const channels = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("#EXTINF:")) {
      const nameMatch = line.match(/,(.*)$/);
      const name = nameMatch ? nameMatch[1].trim() : "";
      const streamUrl = lines[i + 1]?.trim() || "";

      if (name && streamUrl) {
        // Clean channel name
        const cleanName = name
          .replace(/\s*\([^)]*\)/g, "") // Remove (1080p), [Geo-blocked], etc.
          .replace(/\s*\[[^\]]*\]/g, "")
          .trim();

        // Find manual mapping
        const tvgId = manualMappings[cleanName] || manualMappings[name] || "";

        channels.push({
          originalName: name,
          cleanName,
          tvgId,
          streamUrl,
          hasTvgId: !!tvgId,
        });
      }
    }
  }

  return channels;
}

// Generate clean M3U with only good matches
function generateCleanM3U(channels) {
  const goodChannels = channels.filter((ch) => ch.hasTvgId);
  const unknownChannels = channels.filter((ch) => !ch.hasTvgId);

  let m3u = '#EXTM3U url-tvg="fr_epg.xml"\n\n';

  // Add channels with EPG
  m3u += "# CHANNELS WITH EPG\n";
  goodChannels.forEach((channel) => {
    m3u += `#EXTINF:-1 tvg-id="${channel.tvgId}",${channel.originalName}\n`;
    m3u += `${channel.streamUrl}\n`;
  });

  m3u += "\n# CHANNELS WITHOUT EPG\n";
  unknownChannels.slice(0, 10).forEach((channel) => {
    // Limit unknowns
    m3u += `#EXTINF:-1,${channel.originalName}\n`;
    m3u += `${channel.streamUrl}\n`;
  });

  return { m3u, goodChannels, unknownChannels };
}

// Main
async function main() {
  try {
    const playlistContent = fs.readFileSync("fr_corrected.m3u", "utf8");

    console.log("Applying manual mappings...");
    const channels = parseM3U(playlistContent);

    const { m3u, goodChannels, unknownChannels } = generateCleanM3U(channels);

    fs.writeFileSync("fr_clean.m3u", m3u);

    console.log(`\n=== RESULTS ===`);
    console.log(`Channels with EPG: ${goodChannels.length}`);
    console.log(`Channels without EPG: ${unknownChannels.length}`);

    console.log(`\n=== CHANNELS WITH EPG ===`);
    goodChannels.forEach((ch) => {
      console.log(`${ch.cleanName} -> ${ch.tvgId}`);
    });

    console.log(`\n=== MAJOR CHANNELS WITHOUT EPG ===`);
    unknownChannels
      .filter((ch) => !ch.cleanName.includes("Pluto TV"))
      .slice(0, 15)
      .forEach((ch) => {
        console.log(`${ch.cleanName} (needs manual mapping)`);
      });

    console.log("\nGenerated: fr_clean.m3u");
    console.log("This contains only properly mapped channels");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main();
