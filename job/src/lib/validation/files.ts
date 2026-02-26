const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

export function validateImageFile(file: File) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Formato no valido. Usa JPG, PNG o WEBP.");
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("Archivo demasiado grande. Maximo 2MB.");
  }
}
