const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const app = express();
const PORT = 3000;
const uploadDir = path.join(__dirname, "uploads");

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, file.originalname),
});

const upload = multer({ storage });

// Serve frontend files
app.use(express.static("public"));

// Handle file uploads
app.post("/upload", upload.array("videos"), (req, res) => {
    res.json({ message: "Files uploaded!", files: req.files.map(file => file.filename) });
});

// Get video list
app.get("/videos", (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).send("Error reading directory");
        const videoFiles = files.filter(file => file.match(/\.(mp4|webm|ogg)$/i));
        res.json(videoFiles);
    });
});

// Stream video file
app.get("/video", (req, res) => {
    const fileName = req.query.filename;
    const filePath = path.join(uploadDir, fileName);

    if (!fs.existsSync(filePath)) return res.status(404).send("File not found");

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize) return res.status(416).send("Requested range not satisfiable");

        const chunkSize = end - start + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunkSize,
            "Content-Type": "video/mp4",
        });

        fileStream.pipe(res);
    } else {
        res.writeHead(200, {
            "Content-Length": fileSize,
            "Content-Type": "video/mp4",
        });
        fs.createReadStream(filePath).pipe(res);
    }
});

// Delete all videos
app.delete("/videos", (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).send("Error reading directory");
        files.forEach(file => fs.unlinkSync(path.join(uploadDir, file)));
        res.json({ message: "All videos deleted" });
    });
});

// Start WebSocket Server
const server = app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
const wss = new WebSocket.Server({ server });

// Delete files when client disconnects
wss.on("connection", ws => {
    console.log("Client connected");

    ws.on("close", () => {
        console.log("Client disconnected, deleting files...");
        fs.readdir(uploadDir, (err, files) => {
            if (err) return console.error("Error reading files:", err);
            files.forEach(file => fs.unlinkSync(path.join(uploadDir, file)));
            console.log("All uploaded files deleted.");
        });
    });
});
