const fs = require("fs");
const xml2js = require("xml2js");
const https = require("https");

// Download from URL
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}
// Parse M3U playlist
function parseM3U(content) {
  const lines = content.split("\n");
  const channels = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("#EXTINF:")) {
      const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);
      const nameMatch = line.match(/,(.*)$/);

      const tvgId = tvgIdMatch ? tvgIdMatch[1] : "";
      const name = nameMatch ? nameMatch[1].trim() : "";
      const streamUrl = lines[i + 1]?.trim() || "";

      if (name && streamUrl) {
        channels.push({ name, tvgId, streamUrl });
      }
    }
  }

  return channels;
}

// Parse EPG XML
async function parseEPG(xmlContent) {
  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(xmlContent);

  const channels = [];
  if (result.tv && result.tv.channel) {
    result.tv.channel.forEach((channel) => {
      const id = channel.$.id;
      const displayName = channel["display-name"]
        ? channel["display-name"][0]._ || channel["display-name"][0]
        : "";
      channels.push({ id, displayName });
    });
  }

  return channels;
}

// Fuzzy match channel names
function fuzzyMatch(str1, str2) {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, "");
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;

  // Simple similarity score
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

// Match playlist channels to EPG channels
function matchChannels(playlistChannels, epgChannels) {
  const matches = [];
  const unmatched = [];

  playlistChannels.forEach((pChannel) => {
    let bestMatch = null;
    let bestScore = 0;

    epgChannels.forEach((eChannel) => {
      const score = fuzzyMatch(pChannel.name, eChannel.displayName);
      if (score > bestScore && score > 0.6) {
        bestScore = score;
        bestMatch = eChannel;
      }
    });

    if (bestMatch) {
      matches.push({
        playlistName: pChannel.name,
        playlistTvgId: pChannel.tvgId,
        epgId: bestMatch.id,
        epgName: bestMatch.displayName,
        score: bestScore,
        streamUrl: pChannel.streamUrl,
      });
    } else {
      unmatched.push(pChannel);
    }
  });

  return { matches, unmatched };
}

// Generate corrected M3U
function generateCorrectedM3U(matches, unmatched) {
  let m3u = '#EXTM3U url-tvg="fr_epg.xml"\n';

  matches.forEach((match) => {
    m3u += `#EXTINF:-1 tvg-id="${match.epgId}",${match.playlistName}\n`;
    m3u += `${match.streamUrl}\n`;
  });

  // Add unmatched channels without EPG
  unmatched.forEach((channel) => {
    m3u += `#EXTINF:-1,${channel.name}\n`;
    m3u += `${channel.streamUrl}\n`;
  });

  return m3u;
}

// Main function
async function main() {
  try {
    // Read files
    const playlistContent = await downloadFile(
      "https://iptv-org.github.io/iptv/countries/fr.m3u"
    );
    const epgContent = fs.readFileSync("fr_epg.xml", "utf8");

    console.log("Parsing playlist...");
    const playlistChannels = parseM3U(playlistContent);

    console.log("Parsing EPG...");
    const epgChannels = await parseEPG(epgContent);

    console.log(`Playlist channels: ${playlistChannels.length}`);
    console.log(`EPG channels: ${epgChannels.length}`);

    console.log("Matching channels...");
    const { matches, unmatched } = matchChannels(playlistChannels, epgChannels);

    console.log(`\nMatched: ${matches.length}`);
    console.log(`Unmatched: ${unmatched.length}`);

    // Show matches
    console.log("\n=== MATCHES ===");
    matches.forEach((match) => {
      console.log(
        `${match.playlistName} -> ${match.epgName} (${match.epgId}) [${(
          match.score * 100
        ).toFixed(0)}%]`
      );
    });

    // Show unmatched
    console.log("\n=== UNMATCHED ===");
    unmatched.forEach((channel) => {
      console.log(`${channel.name} (no EPG match)`);
    });

    // Generate corrected playlist
    const correctedM3U = generateCorrectedM3U(matches, unmatched);
    fs.writeFileSync("fr_corrected.m3u", correctedM3U);

    console.log("\nGenerated: fr_corrected.m3u");
    console.log(
      "This playlist has proper tvg-id mappings for matched channels"
    );
  } catch (error) {
    console.error("Error:", error.message);
    console.log("\nMake sure you have:");
    console.log("- fr.m3u (your French playlist)");
    console.log("- fr_epg.xml (generated EPG file)");
    console.log("- xml2js installed: npm install xml2js");
  }
}

main();
