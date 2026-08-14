let meta = #{
    name: "gauntlet-dudes",
    description: "Critic/builder loop: push canvas dudes toward Mannay's coding-doodle plates",
    when_to_use: "Improve the faces site against the Mannay reference plates",
    phases: [
        #{ title: "Critique", detail: "independent critics vs Mannay plates" },
        #{ title: "Fix", detail: "one builder closes the biggest gaps" },
        #{ title: "Recheck", detail: "fresh critics on the new pixels" },
        #{ title: "Fix again", detail: "second builder pass" },
        #{ title: "Final check", detail: "critics + progress page" },
    ],
};

let verdict_schema = #{
    "type": "object",
    "required": ["winner", "gap", "evidence"],
    "properties": #{
        "winner": #{ "type": "string" },
        "gap": #{ "type": "string" },
        "evidence": #{ "type": "string" },
    },
};

let fix_schema = #{
    "type": "object",
    "required": ["changed", "notes"],
    "properties": #{
        "changed": #{ "type": "boolean" },
        "notes": #{ "type": "string" },
    },
};

fn critic_prompt(piece) {
    let p = "";
    p += "You are a harsh independent visual critic. Do not be kind. Do not grade a summary. ";
    p += "Inspect real pixels and the drawing code.\n\n";
    p += "WORKSPACE: /Users/johnbrophy/faces\n\n";
    p += "BAR (read these images with the read_file tool before judging):\n";
    p += "- refs/mannay-sheet-1.jpg\n";
    p += "- refs/mannay-sheet-3.jpg\n";
    p += "- refs/mannay-faces-1.jpg\n";
    p += "- refs/lab/frames/f05.jpg (his Faces Lab, 3D yaw)\n";
    p += "- NOTES.md (how the 3D skull actually works)\n\n";
    p += "OURS (read these images AND the code):\n";
    p += "- progress/v2.png, progress/v2b.png\n";
    p += "- every PNG in progress/shots/ if that folder exists\n";
    p += "- dude.js (the live drawing engine)\n";
    p += "- index.html and styles.css if your piece is the page\n\n";
    p += "YOUR PIECE: ";
    p += piece;
    p += "\n\n";
    p += "Compare only that piece. The references are face plates; ours is a full standing dude. ";
    p += "Judge the FACE ink, construction, and character against Mannay. ";
    p += "Judge the BODY as an extension of that same naive ink language, not as clipart or a stick figure.\n\n";
    p += "Mannay hallmarks: confident slightly dry ink (not drunk wobble, not clean vector); ";
    p += "hair as a DARK FILLED MASS sitting on the skull; big noses from the brow; ";
    p += "simple eyes (dots, X, slits, glasses); hats that sit on the head; ";
    p += "3D-pinned features that stay on the face when it turns; irregular oval heads; paper grain.\n\n";
    p += "Set winner to \"ref\" if Mannay still wins this piece, or \"ours\" only if you would rather look at ours. ";
    p += "If ref wins, gap is the SINGLE biggest remaining gap (one sentence). ";
    p += "evidence must name the exact image files and what you saw. ";
    p += "An empty gap is only valid after you have opened the reference images and our screenshots.\n";
    p
}

fn builder_prompt(gaps) {
    let p = "";
    p += "You are the builder. Do not grade your own work. Fix the gaps the critics named.\n\n";
    p += "WORKSPACE: /Users/johnbrophy/faces\n";
    p += "Edit dude.js (and styles.css / index.html only if needed). Keep the 3D skull: ";
    p += "features pinned to yaw/pitch/roll, silhouette from convex hull, not the rotated equator.\n\n";
    p += "Read dude.js, NOTES.md, and the critic gaps below. Then change the code.\n";
    p += "After editing, run: chmod +x scripts/shot.sh && scripts/shot.sh 1107 777 4929 42 88 2026\n";
    p += "Then open the new PNGs in progress/shots/ with read_file and confirm the gap actually moved.\n\n";
    p += "Do not invent a new architecture. Push THIS engine toward the plates: ";
    p += "filled hair masses, bigger noses, denser ink, less stick-figure bodies, more character.\n\n";
    p += "CRITIC GAPS (JSON):\n";
    p += gaps;
    p += "\n\n";
    p += "Set changed=true if you edited files. notes = what you changed and which shots you checked.\n";
    p
}

let pieces = [
    "ink and paper grain (stroke quality vs his dry ink)",
    "hair and hats (filled masses that sit on the 3D skull, not sticks or empty scalps)",
    "head silhouette and face features (oval heads, big noses, simple eyes, 3D pin)",
    "body (naive doodle body in the same ink, not a trapezoid robot)",
    "handwritten name and the page chrome",
];

fn run_critics(label_prefix, piece_list, schema) {
    let jobs = [];
    for piece in piece_list {
        let pr = critic_prompt(piece);
        jobs.push(#{
            prompt: pr,
            label: label_prefix + piece,
            capability_mode: "read-only",
            output_schema: schema,
        });
    }
    parallel(jobs)
}

fn collect_gaps(results) {
    let gaps = [];
    let ours = 0;
    let refs = 0;
    for r in results {
        if r != () && r.success && r.output != () {
            let w = r.output.winner;
            if w == "ours" {
                ours += 1;
            } else {
                refs += 1;
                if r.output.gap != () && r.output.gap != "" {
                    gaps.push(#{
                        winner: w,
                        gap: r.output.gap,
                        evidence: r.output.evidence,
                    });
                }
            }
        }
    }
    #{ gaps: gaps, ours: ours, refs: refs }
}

phase("Critique");
log("Round 1 critics vs Mannay plates");
let r1 = collect_gaps(run_critics("r1:", pieces, verdict_schema));
log("round 1: ours=" + r1.ours.to_string() + " ref=" + r1.refs.to_string() + " gaps=" + r1.gaps.len().to_string());

phase("Fix");
let gaps1 = json_encode(r1.gaps);
let b1 = agent(builder_prompt(gaps1), #{
    label: "builder-1",
    capability_mode: "all",
    output_schema: fix_schema,
});
if b1 == () || !b1.success {
    log("builder 1 failed; continuing to recheck");
}

phase("Recheck");
log("Round 2 critics");
let r2 = collect_gaps(run_critics("r2:", pieces, verdict_schema));
log("round 2: ours=" + r2.ours.to_string() + " ref=" + r2.refs.to_string() + " gaps=" + r2.gaps.len().to_string());

phase("Fix again");
let gaps2 = json_encode(r2.gaps);
let b2 = agent(builder_prompt(gaps2), #{
    label: "builder-2",
    capability_mode: "all",
    output_schema: fix_schema,
});
if b2 == () || !b2.success {
    log("builder 2 failed");
}

phase("Final check");
let r3 = collect_gaps(run_critics("r3:", pieces, verdict_schema));
log("round 3: ours=" + r3.ours.to_string() + " ref=" + r3.refs.to_string() + " gaps=" + r3.gaps.len().to_string());

let smooth = "";
smooth += "Update /Users/johnbrophy/faces/progress.html with this gauntlet run. ";
smooth += "Read the existing file first. Add a new Rounds section for this run: ";
smooth += "how many pieces the refs still won, the remaining gaps, and links to progress/shots/*.png. ";
smooth += "Do not redesign the drawing engine.\n\nRemaining gaps JSON:\n";
smooth += json_encode(r3.gaps);
let sm = agent(smooth, #{
    label: "progress-page",
    capability_mode: "read-write",
});

let report = "";
report += "# Gauntlet dudes\n\n";
report += "Round 1 ref wins: " + r1.refs.to_string() + " / ours: " + r1.ours.to_string() + "\n";
report += "Round 2 ref wins: " + r2.refs.to_string() + " / ours: " + r2.ours.to_string() + "\n";
report += "Round 3 ref wins: " + r3.refs.to_string() + " / ours: " + r3.ours.to_string() + "\n\n";
report += "Remaining gaps:\n" + json_encode(r3.gaps) + "\n";
let path = write_scratch_file("report.md", report);
complete(#{
    path: path,
    round1_ref: r1.refs,
    round2_ref: r2.refs,
    round3_ref: r3.refs,
    remaining: r3.gaps.len(),
});
