export function configureInlineVideo(video: HTMLVideoElement, muted: boolean): void {
  video.autoplay = muted
  video.muted = muted
  video.defaultMuted = muted
  video.playsInline = true
  video.controls = false
  video.disablePictureInPicture = true
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  video.setAttribute('x5-playsinline', '')
  video.setAttribute('x5-video-player-type', 'h5-page')
  video.setAttribute('x5-video-player-fullscreen', 'false')
  video.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback')
  video.setAttribute('disableRemotePlayback', '')
  video.setAttribute('x-webkit-airplay', 'deny')
}
