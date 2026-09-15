// R Pose Assets Preview v5 — reconstruct the q88 chin-rest sprite from six cached static chunks.
(function(){
  const a=window.REDPoseAssets=window.REDPoseAssets||{};
  const preview='../red-mobile-a8/assets/r-body-v1/pose-preview.webp?v=3';
  const chunks=window.REDPoseHQ02||[];
  const chin=chunks.length===6 && chunks.every(Boolean)
    ? 'data:image/webp;base64,'+chunks.join('')
    : preview;
  a.pose_01_hug_knees=preview;
  a.pose_02_chin_rest=chin;
  a.pose_03_side_sit=preview;
  a.pose_04_peek_edge=preview;
  a.pose_05_sleepy_curl=preview;
  a.pose_06_look_back=preview;
  window.REDPoseHQ02=null;
})();
