const http = require('http');

const API_BASE = 'http://localhost:3000/api'; // Next.js API
const TOKEN = ''; // Set manually or fetch via login

function calculateBattingPoints(runs, fours, sixes, duck = false) {
    if (duck) return -2;
    
    let pts = runs * 1;
    pts += fours * 4;
    pts += sixes * 6;
    
    // Milestones (Exclusive)
    if (runs >= 100) {
        pts += 16;
    } else if (runs >= 75) {
        pts += 12;
    } else if (runs >= 50) {
        pts += 8;
    } else if (runs >= 25) {
        pts += 4;
    }
    
    return pts;
}

function calculateBowlingPoints(wickets, lbw_bowled = 0, maidens = 0) {
    let pts = wickets * 30;
    pts += lbw_bowled * 8;
    pts += maidens * 12;
    
    // Hauls
    if (wickets >= 5) {
        pts += 12;
    } else if (wickets >= 4) {
        pts += 8;
    } else if (wickets >= 3) {
        pts += 4;
    }
    
    return pts;
}

function calculateFieldingPoints(catches, stumpings, runouts_direct, runouts_indirect) {
    let pts = catches * 8;
    if (catches >= 3) pts += 4;
    
    pts += stumpings * 12;
    pts += runouts_direct * 12;
    pts += runouts_indirect * 6;
    
    return pts;
}

// Match 1 Data (RCB 203/4 vs SRH 201/9)
const matchData = [
    // SRH Batting
    { id: 230, name: 'Ishan Kishan', runs: 80, fours: 8, sixes: 5 },
    { id: 228, name: 'Aniket Verma', runs: 43, fours: 3, sixes: 4 },
    { id: 231, name: 'Heinrich Klaasen', runs: 31, fours: 2, sixes: 1, catches: 2 },
    { id: 226, name: 'Travis Head', runs: 11, fours: 2, sixes: 0 },
    { id: 227, name: 'Abhishek Sharma', runs: 7, fours: 0, sixes: 1 },
    { id: 242, name: 'Salil Arora', runs: 9, fours: 0, sixes: 1 },
    { id: 232, name: 'Nitish Kumar Reddy', runs: 1, fours: 0, sixes: 0 },
    { id: 233, name: 'Harsh Dubey', runs: 3, fours: 0, sixes: 0, wickets: 1, catches: 1 },
    { id: 238, name: 'Jaydev Unadkat', runs: 4, fours: 0, sixes: 0, wickets: 1, catches: 1 },
    { id: 235, name: 'Harshal Patel', runs: 0, fours: 0, sixes: 0, duck: true },
    { id: 239, name: 'Eshan Malinga', wickets: 0 },
    
    // RCB Batting / Bowling
    { id: 202, name: 'Virat Kohli', runs: 69, fours: 5, sixes: 5, catches: 1 },
    { id: 204, name: 'Devdutt Padikkal', runs: 61, fours: 7, sixes: 4, catches: 3 },
    { id: 201, name: 'Rajat Patidar', runs: 31, fours: 2, sixes: 3 },
    { id: 203, name: 'Tim David', runs: 16, fours: 1, sixes: 1 },
    { id: 205, name: 'Phil Salt', runs: 8, fours: 2, sixes: 0, catches: 3 },
    { id: 206, name: 'Jitesh Sharma', runs: 0, fours: 0, sixes: 0, duck: true, catches: 1 },
    { id: 219, name: 'Jacob Duffy', wickets: 3 },
    { id: 209, name: 'Romario Shepherd', wickets: 3 },
    { id: 212, name: 'Bhuvneshwar Kumar', wickets: 1 },
    { id: 215, name: 'Suyash Sharma', wickets: 1 },
    { id: 217, name: 'Abhinandan Singh', wickets: 1, catches: 1 },
    { id: 207, name: 'Krunal Pandya', wickets: 0 }
];

const finalScores = matchData.map(p => {
    let pts = 0;
    pts += calculateBattingPoints(p.runs || 0, p.fours || 0, p.sixes || 0, p.duck || false);
    pts += calculateBowlingPoints(p.wickets || 0, 0, 0); // Assuming 0 LBW/Maidens for now
    pts += calculateFieldingPoints(p.catches || 0, p.stumpings || 0, p.runouts_direct || 0, p.runouts_indirect || 0);
    return { player_id: p.id, points: pts, name: p.name };
});

console.log("Calculated Final Scores for Match 1:");
console.table(finalScores);

function post(path, body, token) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': data.length };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    
    const req = http.request({
      hostname: 'localhost', port: 3000, path: '/api' + path, method: 'POST', headers
    }, res => {
      let r = ''; res.on('data', c => r += c); res.on('end', () => resolve({code: res.statusCode, data: r}));
    });
    req.on('error', e => resolve({code: 500, data: e.message}));
    req.write(data); req.end();
  });
}

async function run() {
    console.log("1. Registering/Logging in...");
    const email = "admin_test@test.com";
    const r1 = await post('/auth/register', { email, password: "123", name: "Admin" });
    let token;
    if (r1.code === 201 || r1.code === 200) {
        token = JSON.parse(r1.data).token;
    } else {
        // Try login if already registered
        const r2 = await post('/auth/login', { email, password: "123" });
        if (r2.code === 200) token = JSON.parse(r2.data).token;
    }

    if (!token) {
        console.error("Failed to get token", r1.data);
        return;
    }

    console.log("2. Pushing scores to /api/players/scores...");
    const scoresToPush = finalScores.map(s => ({ player_id: s.player_id, match_number: 1, points: s.points }));
    const r3 = await post('/players/scores', scoresToPush, token);
    console.log(r3.code, r3.data);

    if (r3.code === 200) {
        console.log("SUCCESS: Scores pushed for Match 1!");
    } else {
        console.error("FAILED to push scores");
    }
}

run();
