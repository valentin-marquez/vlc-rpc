import { logger } from "@main/services/logger"

interface ImageUploadService {
    name: string
    upload: (imageBuffer: Buffer, filename: string, expiryHours?: number) => Promise<string | null>
    maxFileSize: number
    supportsExpiry: boolean
}

export class MultiImageUploaderService {
    private static instance: MultiImageUploaderService | null = null
    private readonly appVersion = "4.0.2"
    private readonly appName = "VLC-Discord-RPC"
    
    private readonly userAgents = [
        "curl/8.13.0",
        "PostmanRuntime/7.32.0",
        "Wget/1.21.3",
        "HTTPie/3.2.2",
        "insomnia/2023.5.8",
        "Python-urllib/3.11"
    ]
    
    private currentUserAgentIndex = 0
    
    private readonly services: ImageUploadService[] = [
        {
            name: "x0.at",
            upload: this.uploadToX0At.bind(this),
            maxFileSize: 512 * 1024 * 1024,
            supportsExpiry: false
        },
        {
            name: "catbox.moe",
            upload: this.uploadToCatbox.bind(this),
            maxFileSize: 200 * 1024 * 1024,
            supportsExpiry: false
        },
        {
            name: "uguu.se",
            upload: this.uploadToUguu.bind(this),
            maxFileSize: 128 * 1024 * 1024,
            supportsExpiry: false
        },
        {
            name: "0x0.st",
            upload: this.uploadTo0x0st.bind(this),
            maxFileSize: 512 * 1024 * 1024,
            supportsExpiry: true
        },
        {
            name: "tmpfiles.org",
            upload: this.uploadToTmpFiles.bind(this),
            maxFileSize: 100 * 1024 * 1024,
            supportsExpiry: false
        }
    ]

    private constructor() {
        logger.info("Multi-service image uploader initialized")
        this.shuffleUserAgents()
    }

    public static getInstance(): MultiImageUploaderService {
        if (!MultiImageUploaderService.instance) {
            MultiImageUploaderService.instance = new MultiImageUploaderService()
        }
        return MultiImageUploaderService.instance
    }

    public async uploadImage(
        imageBuffer: Buffer,
        filename: string,
        expiryHours = 24
    ): Promise<string | null> {
        const fileSize = imageBuffer.length
        logger.info(`Starting multi-service upload: ${filename} (${fileSize} bytes)`)

        for (const service of this.services) {
            if (fileSize > service.maxFileSize) {
                logger.warn(`Skipping ${service.name}: file too large (${fileSize} > ${service.maxFileSize})`)
                continue
            }

            try {
                logger.info(`Attempting upload to ${service.name}`)
                
                const result = await service.upload(imageBuffer, filename, expiryHours)
                
                if (result) {
                    logger.info(`Successfully uploaded to ${service.name}: ${result}`)
                    return result
                }
                
                logger.warn(`Upload to ${service.name} returned null`)
            } catch (error) {
                logger.error(`Upload to ${service.name} failed: ${error}`)
            }

            this.rotateUserAgent()
        }

        logger.error("All upload services failed")
        return null
    }

    public async uploadImageFromUrl(imageUrl: string, expiryHours = 24): Promise<string | null> {
        logger.info(`Starting multi-service URL upload: ${imageUrl}`)

        try {
            const response = await fetch(imageUrl, {
                headers: {
                    "User-Agent": this.getCurrentUserAgent(),
                },
            })

            if (!response.ok) {
                logger.error(`Failed to download image from URL: ${response.status}`)
                return null
            }

            const imageBuffer = Buffer.from(await response.arrayBuffer())
            const filename = `cover_${Date.now()}.jpg`

            return await this.uploadImage(imageBuffer, filename, expiryHours)
        } catch (error) {
            logger.error(`Error downloading image from URL: ${error}`)
            return null
        }
    }

    private getCurrentUserAgent(): string {
        return this.userAgents[this.currentUserAgentIndex]
    }

    private rotateUserAgent(): void {
        this.currentUserAgentIndex = (this.currentUserAgentIndex + 1) % this.userAgents.length
    }

    private shuffleUserAgents(): void {
        for (let i = this.userAgents.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[this.userAgents[i], this.userAgents[j]] = [this.userAgents[j], this.userAgents[i]]
        }
        logger.info(`User agents shuffled, starting with: ${this.userAgents[0]}`)
    }

    private async uploadToX0At(imageBuffer: Buffer, filename: string): Promise<string | null> {
        const formData = new FormData()
        
        const uint8Array = new Uint8Array(imageBuffer)
        const blob = new Blob([uint8Array], {
            type: this.getMimeType(filename),
        })

        formData.append("file", blob, filename)

        const response = await fetch("https://x0.at/", {
            method: "POST",
            body: formData,
            headers: {
                "User-Agent": this.getCurrentUserAgent(),
            },
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }

        const result = await response.text()
        return result.trim().startsWith("http") ? result.trim() : null
    }

    private async uploadToCatbox(imageBuffer: Buffer, filename: string): Promise<string | null> {
        const formData = new FormData()
        
        const uint8Array = new Uint8Array(imageBuffer)
        const blob = new Blob([uint8Array], {
            type: this.getMimeType(filename),
        })

        formData.append("reqtype", "fileupload")
        formData.append("fileToUpload", blob, filename)

        const response = await fetch("https://catbox.moe/user/api.php", {
            method: "POST",
            body: formData,
            headers: {
                "User-Agent": this.getCurrentUserAgent(),
            },
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }

        const result = await response.text()
        return result.trim().startsWith("http") ? result.trim() : null
    }

    private async uploadToUguu(imageBuffer: Buffer, filename: string): Promise<string | null> {
        const formData = new FormData()
        
        const uint8Array = new Uint8Array(imageBuffer)
        const blob = new Blob([uint8Array], {
            type: this.getMimeType(filename),
        })

        formData.append("files[]", blob, filename)

        const response = await fetch("https://uguu.se/upload", {
            method: "POST",
            body: formData,
            headers: {
                "User-Agent": this.getCurrentUserAgent(),
            },
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }

        const result = await response.json()
        
        if (result.success && result.files && result.files.length > 0) {
            return result.files[0].url
        }
        
        return null
    }

    private async uploadTo0x0st(imageBuffer: Buffer, filename: string, expiryHours = 24): Promise<string | null> {
        const formData = new FormData()
        
        const uint8Array = new Uint8Array(imageBuffer)
        const blob = new Blob([uint8Array], {
            type: this.getMimeType(filename),
        })

        formData.append("file", blob, filename)
        formData.append("expires", expiryHours.toString())
        formData.append("secret", "")

        const response = await fetch("https://0x0.st", {
            method: "POST",
            body: formData,
            headers: {
                "User-Agent": this.getCurrentUserAgent(),
            },
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }

        const result = await response.text()
        return result.trim().startsWith("http") ? result.trim() : null
    }

    private async uploadToTmpFiles(imageBuffer: Buffer, filename: string): Promise<string | null> {
        const formData = new FormData()
        
        const uint8Array = new Uint8Array(imageBuffer)
        const blob = new Blob([uint8Array], {
            type: this.getMimeType(filename),
        })

        formData.append("file", blob, filename)

        const response = await fetch("https://tmpfiles.org/api/v1/upload", {
            method: "POST",
            body: formData,
            headers: {
                "User-Agent": this.getCurrentUserAgent(),
            },
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }

        const result = await response.json()
        
        if (result.status === "success" && result.data && result.data.url) {
            const url = result.data.url
            return url.replace("http://tmpfiles.org/", "https://tmpfiles.org/dl/")
        }
        
        return null
    }

    private getMimeType(filename: string): string {
        const ext = filename.toLowerCase().split(".").pop()

        switch (ext) {
            case "jpg":
            case "jpeg":
                return "image/jpeg"
            case "png":
                return "image/png"
            case "gif":
                return "image/gif"
            case "webp":
                return "image/webp"
            case "bmp":
                return "image/bmp"
            default:
                return "image/jpeg"
        }
    }

    public generateMetadataTags(imageUrl: string, expiryDate?: Date): Record<string, string> {
        const tags: Record<string, string> = {
            "X-COVER-URL": imageUrl,
            "X-APP-VERSION": this.appVersion,
            "X-PROCESSED-BY": this.appName,
        }

        if (expiryDate) {
            tags["X-EXPIRY-DATE"] = expiryDate.toISOString()
        }

        return tags
    }

    public parseMetadataTags(metadata: Record<string, string | undefined>): {
        imageUrl: string | null
        isExpired: boolean
        appVersion: string | null
        processedBy: string | null
    } {
        const imageUrl = metadata["X-COVER-URL"] || null
        const appVersion = metadata["X-APP-VERSION"] || null
        const processedBy = metadata["X-PROCESSED-BY"] || null
        const expiryDateStr = metadata["X-EXPIRY-DATE"]

        let isExpired = false
        if (expiryDateStr) {
            try {
                const expiryDate = new Date(expiryDateStr)
                isExpired = expiryDate.getTime() < Date.now()
            } catch (error) {
                logger.warn(`Invalid expiry date format: ${expiryDateStr}`)
            }
        }

        return {
            imageUrl,
            isExpired,
            appVersion,
            processedBy,
        }
    }
}

export const multiImageUploaderService = MultiImageUploaderService.getInstance()
