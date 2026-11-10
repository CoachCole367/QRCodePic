const $ = (id) => document.getElementById(id);
const video = $("video");
let stream = null;
let photoUrl = null;
let attempt = 0;
let busy = false;
let autoStart;

function stopCamera() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
}

function clearPhoto() {
  $("photo").removeAttribute("src");
  $("download").removeAttribute("href");
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null;
}

function reset(message = "Allow your front camera for one automatic selfie.") {
  cancelAnimationFrame(autoStart);
  attempt++;
  stopCamera();
  busy = false;
  $("start").disabled = false;
  $("start").hidden = false;
  $("capture").hidden = true;
  $("status").textContent = message;
}

function manual(message) {
  $("status").textContent = message;
  $("start").hidden = true;
  $("capture").hidden = false;
  $("capture").disabled = false;
}

// Wait for actual video pixels, rather than capturing a blank metadata-only frame.
function waitForFrame(id, timeout = 8000) {
  return new Promise((resolve) => {
    const deadline = performance.now() + timeout;
    const check = () => {
      if (id !== attempt) return resolve(false);
      if (
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      )
        return resolve(true);
      if (performance.now() >= deadline) return resolve(false);
      setTimeout(check, 16);
    };
    check();
  });
}

async function capture(id = attempt) {
  if (!stream || id !== attempt || document.hidden) return;
  $("capture").disabled = true;
  if (video.readyState < 2 || !video.videoWidth) {
    manual("The camera is warming up. Tap again in a moment.");
    return;
  }
  try {
    const canvas = document.createElement("canvas");
    // Crop a portrait frame and mirror it to match the front-camera preview.
    const sourceWidth = Math.min(video.videoWidth, (video.videoHeight * 4) / 5);
    const sourceHeight = (sourceWidth * 5) / 4;
    canvas.width = Math.min(1440, Math.round(sourceWidth));
    canvas.height = Math.round((canvas.width * 5) / 4);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(
      video,
      (video.videoWidth - sourceWidth) / 2,
      (video.videoHeight - sourceHeight) / 2,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    stopCamera(); // Release the hardware before encoding or revealing anything.
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    canvas.width = canvas.height = 0;
    if (id !== attempt) return;
    if (!blob) throw new Error("Photo encoding failed");
    clearPhoto();
    photoUrl = URL.createObjectURL(blob);
    $("photo").src = photoUrl;
    $("download").href = photoUrl;
    document.body.classList.add("captured");
    document.title = "THIS YOU?";
    $("setup").hidden = true;
    $("reveal").hidden = false;
    $("reveal-title").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
    busy = false;
  } catch {
    reset("The photo couldn’t be captured. Tap Allow camera to try again.");
  }
}

async function startCamera() {
  cancelAnimationFrame(autoStart);
  if (busy || document.hidden) return;
  clearPhoto();
  const id = ++attempt;
  if (!window.isSecureContext) {
    reset(
      "Camera access needs HTTPS. Open the secure website link in Safari or Chrome.",
    );
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    reset(
      "This browser cannot open the camera. Open this link directly in Safari or Chrome.",
    );
    return;
  }
  busy = true;
  $("start").disabled = true;
  $("start").hidden = true;
  $("status").textContent =
    "Allow camera access in your browser. One selfie, then it switches off.";
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1440 },
        height: { ideal: 1800 },
      },
    });
    // A permission prompt may finish after the visitor leaves or cancels.
    if (id !== attempt || document.hidden) {
      acquired.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = acquired;
    for (const track of stream.getVideoTracks()) {
      track.addEventListener(
        "ended",
        () => {
          if (id === attempt && stream)
            reset("The camera disconnected. Reconnect it and try again.");
        },
        { once: true },
      );
    }
    video.srcObject = stream;
    video.muted = true;
    $("start").hidden = true;
    $("status").textContent =
      "Camera warming up. Your selfie will be taken automatically…";
    try {
      await video.play();
    } catch {
      if (id === attempt)
        manual("Your browser needs a tap. Take the selfie when you’re ready.");
      return;
    }
    if (!(await waitForFrame(id))) {
      if (id === attempt)
        reset(
          "The camera didn’t send a frame. Close other camera apps, then try again.",
        );
      return;
    }
    await capture(id);
  } catch (error) {
    if (id !== attempt) return;
    const messages = {
      NotAllowedError:
        "Camera access is off. Allow it in this site’s browser settings, then try again. In an app? Open this link in Safari or Chrome.",
      NotFoundError:
        "No camera found. Try this link on a phone with a front camera.",
      NotReadableError:
        "The camera is busy. Close other camera apps, then try again.",
      OverconstrainedError:
        "This camera isn’t available. Try another camera or browser.",
      SecurityError:
        "This browser has camera access disabled. Open the secure link in Safari or Chrome.",
      AbortError: "The camera was interrupted. Tap Allow camera to try again.",
    };
    reset(
      messages[error.name] ||
        "The camera couldn’t start. Try again or open the link in Safari or Chrome.",
    );
  }
}

$("start").addEventListener("click", startCamera);
$("capture").addEventListener("click", async () => {
  const id = attempt;
  $("capture").disabled = true;
  try {
    await video.play();
    if (!(await waitForFrame(id))) {
      if (id === attempt)
        reset("The camera didn’t send a frame. Please try again.");
      return;
    }
    await capture(id);
  } catch {
    if (id === attempt)
      reset("The camera couldn’t play. Please try again in Safari or Chrome.");
  }
});
$("cancel").addEventListener("click", () =>
  reset("No problem. Nothing saved. Tap Allow camera if you change your mind."),
);
$("retake").addEventListener("click", () => {
  reset();
  clearPhoto();
  document.body.classList.remove("captured");
  document.title = "One moment…";
  $("reveal").hidden = true;
  $("setup").hidden = false;
  startCamera();
});
$("forget").addEventListener("click", () => {
  reset("Photo deleted from this page. Nothing was uploaded.");
  clearPhoto();
  document.body.classList.remove("captured");
  document.title = "One moment…";
  $("reveal").hidden = true;
  $("setup").hidden = false;
  $("start").focus();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden)
    reset("Camera paused. Tap Allow camera when you’re back.");
});
window.addEventListener("pagehide", () => {
  reset();
  clearPhoto();
});
window.addEventListener("pageshow", () => {
  if (!photoUrl && !$("reveal").hidden) {
    document.body.classList.remove("captured");
    document.title = "One moment…";
    $("reveal").hidden = true;
    $("setup").hidden = false;
  }
});
$("year").textContent = new Date().getFullYear();
// Paint the brief camera notice, then request permission without a timed delay.
autoStart = requestAnimationFrame(startCamera);
