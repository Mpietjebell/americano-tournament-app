/**
 * Kie.ai Nano Banana image generation service.
 * Never import this on the frontend — server/agent use only.
 */

import fs from "fs";
import path from "path";
import https from "https";

const KIE_API_BASE = "https://api.kie.ai/api/v1";
const OUTPUT_DIR = path.resolve(process.cwd(), "generated-images");
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40; // 2 minutes max

interface CreateTaskResponse {
    data?: { taskId: string };
    taskId?: string;
    error?: string;
}

interface RecordInfoResponse {
    data?: {
        state: string;
        resultUrls?: string[];
    };
    state?: string;
    resultUrls?: string[];
}

function getApiKey(): string {
    const key = process.env.KIE_API_KEY;
    if (!key) throw new Error("KIE_API_KEY environment variable is not set.");
    return key;
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 60);
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, options);
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status} from ${url}: ${body}`);
    }
    return response.json() as Promise<T>;
}

async function createTask(prompt: string): Promise<string> {
    const apiKey = getApiKey();

    const body = {
        model: "google/nano-banana",
        prompt,
        output_format: "png",
        image_size: "16:9",
    };

    const result = await fetchJson<CreateTaskResponse>(`${KIE_API_BASE}/jobs/createTask`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });

    const taskId = result.data?.taskId ?? result.taskId;
    if (!taskId) throw new Error(`No taskId in response: ${JSON.stringify(result)}`);
    return taskId;
}

async function pollResult(taskId: string): Promise<string> {
    const apiKey = getApiKey();
    const url = `${KIE_API_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;

    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

        let result: RecordInfoResponse;
        try {
            result = await fetchJson<RecordInfoResponse>(url, {
                headers: { Authorization: `Bearer ${apiKey}` },
            });
        } catch (err) {
            console.warn(`[nano-banana] Poll attempt ${attempt} failed, retrying...`, err);
            continue;
        }

        const state = result.data?.state ?? result.state;
        const resultUrls = result.data?.resultUrls ?? result.resultUrls;

        console.log(`[nano-banana] Attempt ${attempt}/${MAX_POLL_ATTEMPTS} — state: ${state}`);

        if (state === "success") {
            const url = resultUrls?.[0];
            if (!url) throw new Error("Task succeeded but no result URL returned.");
            return url;
        }

        if (state === "failed" || state === "error") {
            throw new Error(`Image generation failed. State: ${state}`);
        }
    }

    throw new Error(`Timed out waiting for task ${taskId} after ${MAX_POLL_ATTEMPTS} attempts.`);
}

function downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https
            .get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
                    return;
                }
                response.pipe(file);
                file.on("finish", () => {
                    file.close();
                    resolve();
                });
            })
            .on("error", (err) => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
    });
}

/**
 * Generate an image from a text prompt using Kie.ai Nano Banana.
 * Returns the saved local file path.
 */
export async function generateImage(prompt: string): Promise<string> {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log(`[nano-banana] Creating task for: "${prompt}"`);
    const taskId = await createTask(prompt);
    console.log(`[nano-banana] Task created: ${taskId}`);

    const imageUrl = await pollResult(taskId);
    console.log(`[nano-banana] Image ready: ${imageUrl}`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const slug = slugify(prompt);
    const fileName = `${timestamp}-${slug}.png`;
    const destPath = path.join(OUTPUT_DIR, fileName);

    await downloadFile(imageUrl, destPath);
    console.log(`[nano-banana] Saved to: ${destPath}`);

    return destPath;
}

/**
 * Convenience helper — generate a hero image and return the saved path.
 */
export async function generateHeroImage(prompt: string): Promise<string> {
    return generateImage(prompt);
}
