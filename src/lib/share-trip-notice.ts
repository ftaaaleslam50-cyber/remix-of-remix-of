/** Browser sharing keeps passenger lists text-only and attaches the bus image only to notices. */
export async function copyTripText(text: string, image?: Blob | null): Promise<void> {
  if (image && typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    try {
      const bitmap = await createImageBitmap(image);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      bitmap.close();
      const png = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("تعذّر نسخ الصورة")), "image/png"),
      );
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "image/png": png })]);
      return;
    } catch {
      // Some browsers do not support copying text and an image together.
    }
  }
  await navigator.clipboard.writeText(text);
}

export async function shareTripText(text: string, image?: Blob | null, filename = "bus.jpg"): Promise<"shared" | "copied" | "cancelled"> {
  if (navigator.share) {
    try {
      const file = image ? new File([image], filename, { type: image.type || "image/jpeg" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ text, files: [file] });
      } else {
        await navigator.share({ text });
      }
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      throw error;
    }
  }
  await copyTripText(text, image);
  return "copied";
}