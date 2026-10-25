import * as React from "react"

// Neutral placeholder shown when there's no image or it fails to load.
const FALLBACK_IMAGE_URL =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">' +
      '<rect width="400" height="300" fill="#ece8e1"/>' +
      '<path d="M150 190l35-45 25 30 20-22 40 37z" fill="#c9c1b4"/><circle cx="235" cy="120" r="14" fill="#c9c1b4"/>' +
      "</svg>"
  )

/** Lazy-loading image that falls back to a neutral placeholder if the file is missing. */
const Image = React.forwardRef(({ src, onError, loading = "lazy", decoding = "async", alt = "", ...props }, ref) => {
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => setFailed(false), [src])

  const handleError = (event) => {
    if (failed) return
    setFailed(true)
    onError?.(event)
  }

  return (
    <img
      ref={ref}
      src={!src || failed ? FALLBACK_IMAGE_URL : src}
      alt={alt}
      loading={loading}
      decoding={decoding}
      onError={handleError}
      {...props}
    />
  )
})
Image.displayName = "Image"

export { Image }
