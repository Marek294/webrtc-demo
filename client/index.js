/// IMPORT reactive-dao for disconnect-resistant communication protocol
import ReactiveDao from "reactive-dao"
import ReactiveSockJS from "reactive-dao-sockjs"

/// Globally Unique IDentifier generator - for client-side generated session numbers
function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4()
}
/// random session id
let sessionId = guid()

/// Create data access object
let dao = new ReactiveDao(sessionId, {
  /// data access object remote endpoint url
  remoteUrl: document.location.protocol + '//' + document.location.host + "/sockjs",
  protocols: { // Load reactive-dao protocol transports
    'sockjs': ReactiveSockJS // SockJS transport
  },
  room: { // Room info service object
    type: "remote", // Remote object - synchronized with server DAO
    generator: ReactiveDao.ObservableList // Observable list is more universal than observable-value
  }
})


const peerConnectionConfig = {
  "iceServers": [{"url": "turn:turn.xaos.ninja:4433", username:"test", credential: "12345"}]
}

/// Some useful variables
let roomName = null
let myIp = null
let calling = undefined
let remoteIce = []
let remoteSdp = null
let peerConnection = null
let localStream = null

/// Create view object
let view = {
  /// Find all elements needed
  title: document.getElementById('title'),
  loading: document.getElementById('loading'),
  loadingText: document.getElementById('loadingText'),
  error: document.getElementById('error'),
  errorText: document.getElementById('errorText'),
  roomInputContainer: document.getElementById('roomInputContainer'),
  roomName: document.getElementById('roomName'),
  joinButton: document.getElementById('joinButton'),
  videoContainer: document.getElementById('videoContainer'),
  video: document.getElementById('video'),
  status: document.getElementById('status'),

  /// Function that hide all main content elements
  hideAll() {
    this.loading.style.display = 'none'
    this.error.style.display = 'none'
    this.roomInputContainer.style.display = 'none'
    this.videoContainer.style.display = 'none'
  },

  /// Shows loading screen
  showLoading(text, status) {
    this.hideAll() // Hide other/all screens
    // clear style.display so element will have it's css based display property
    this.loading.style.display = ''
    this.loadingText.innerText = text
    if(status) { // If status parameter exists set status too
      this.status.innerText = status
    }
  },

  /// Shows error screen
  showError(text, status) {
    this.hideAll()
    this.error.style.display = ''
    this.errorText.innerText = text
    if(status) { // If status parameter exists set status too
      this.status.innerText = status
    }
  },

  /// Shows room input screen
  showRoomInput() {
    this.hideAll()
    this.roomInputContainer.style.display = ''
    this.status.innerText = 'Enter room name, and click [join] button.'
  },

  /// Show video
  showVideo(url) {
    this.hideAll()
    this.videoContainer.style.display = ''
    this.video.src = url
    this.video.play()
    this.status.innerText = 'Connected.'
  }
}

function sendAnswer() {
  console.log("SEND ALL")
  peerConnection.createAnswer(
    answer => {
      peerConnection.setLocalDescription(answer)
      dao.request(['room', 'setSdp'], roomName, answer.toJSON())
    },
    error => view.showError(error, "WebRTC error occured")
  )
}
function sendOffer() {
  console.log("SEND ALL")
  peerConnection.createOffer(
    offer => {
      peerConnection.setLocalDescription(offer)
      dao.request(['room', 'setSdp'], roomName, offer.toJSON())
    },
    error => view.showError(error, "WebRTC error occured")
  )
}

function resetWebRTC() {
  console.log("RESET WEBRTC")
  peerConnection = null
  if(!myIp) return // wait for ip
  if(calling === undefined) return // wait for calling status
  console.log("INIT WEBRTC")
  peerConnection = new (RTCPeerConnection || webkitRTCPeerConnection || mozRTCPeerConnection)(peerConnectionConfig)
  peerConnection.onicecandidate = function (evt) {
    if(evt.candidate) dao.request(['room', 'addIce'], roomName, evt.candidate)
  }
  peerConnection.onaddstream = function (evt) {
    view.showVideo(URL.createObjectURL(evt.stream))
  }
  peerConnection.addStream(localStream)
  for(let candidate of remoteIce) peerConnection.addIceCandidate(candidate)
  if(remoteSdp) {
    peerConnection.setRemoteDescription(remoteSdp)
    if (!calling) sendAnswer()
  }
  if (calling) sendOffer()
}

/// Enter room action
function enterRoom(roomNamep) {
  roomName = roomNamep
  view.showLoading("Connecting to room "+roomName, "Please wait.")
  dao.observable(['room', 'amICalling', roomName]).observe({
    set(callingp) {
      if(calling == undefined) {
        calling = callingp
      } else {
        if(calling != callingp) {
          resetWebRTC()
        }
      }
    }
  })
  dao.observable(['room', 'myIp', roomName]).observe({
    set(ip) { // Reaction to ip changes
      if(myIp !== ip) {
        myIp = ip
        resetWebRTC()
      } else { // Reaction to reconnect
        dao.request(["room", "setSdp"], roomName, peerConnection.currentLocalDescription.toJSON())
      }
    }
  })
  dao.observable(['room', 'otherUserIce', roomName]).observe({
    set(initialIce) { // Reaction to ice reset
      for(let ice of initialIce) peerConnection.addIceCandidate(new RTCIceCandidate(ice))
    },
    push(candidate) {
      remoteIce.push(candidate)
      peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    }
  })
  dao.observable(['room', 'otherUserSdp', roomName]).observe({
    set(sdp) { // Reaction to sdp changes
      if(sdp) {
        peerConnection.setRemoteDescription(new RTCSessionDescription(sdp))
        if(!calling) sendAnswer()
      }
    }
  })
}

// bind events
view.roomInputContainer.addEventListener("submit", (ev) => {
  ev.preventDefault();
  enterRoom(view.roomName.value)
})

view.showLoading("Waiting for video input.", "Please connect camera.")
navigator.mediaDevices.getUserMedia({ audio: true, video: true })
  .then(function(stream) {
    localStream = stream
    //view.showVideo(URL.createObjectURL(stream))
    view.showRoomInput()
  })
  .catch(function(err) {
    view.showError("Camera device not found.", "...")
  })