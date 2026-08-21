(function () {
  'use strict';

  var PREFIX = 'f1ti_track_calibration_v1:';
  var api = null;
  var launcher = null;
  var panel = null;
  var marker = null;
  var liveTimer = 0;
  var drag = null;
  var mapDragFrame = 0;
  var mapDragDX = 0;
  var mapDragDY = 0;
  var mapDragMode = 'orbit';
  var carDrag = false;
  var coordinatePick = true;
  var coordinateResult = null;
  var selectedCarId = 'player';
  var ISSUE_PREFIX = 'f1ti_track_issue_markers_v1:';
  var issueMode = 'off';
  var issueMarkers = [];
  var issueList = null;
  var issueMarkerNodes = [];

  function issueLabel(type) {
    return type === 'clipping' ? '穿模' : '颠簸';
  }

  function issueKey() {
    var trackId = api?.getState()?.trackId || globalThis.__F1TI_TRACK_CONFIG__?.id || 'unknown';
    return ISSUE_PREFIX + trackId;
  }

  function loadIssueMarkers() {
    try {
      var data = JSON.parse(localStorage.getItem(issueKey()) || '[]');
      issueMarkers = Array.isArray(data) ? data.filter(function (item) {
        return item && ['clipping', 'bump'].includes(item.type) && [item.x, item.y, item.z].every(Number.isFinite);
      }) : [];
    } catch (_) {
      issueMarkers = [];
    }
    globalThis.__F1TI_ISSUE_MARKERS__ = issueMarkers;
  }

  function saveIssueMarkers() {
    localStorage.setItem(issueKey(), JSON.stringify(issueMarkers));
    globalThis.__F1TI_ISSUE_MARKERS__ = issueMarkers;
  }

  function clearIssueMarkerNodes() {
    issueMarkerNodes.forEach(function (node) { node.remove(); });
    issueMarkerNodes = [];
  }

  function updateIssueMarkerPositions() {
    if (!api?.projectWorldPoint) return;
    issueMarkerNodes.forEach(function (node, index) {
      var item = issueMarkers[index];
      var point = item && api.projectWorldPoint(item);
      node.style.display = point?.visible ? '' : 'none';
      if (point) {
        node.style.left = point.x + 'px';
        node.style.top = point.y + 'px';
      }
    });
  }

  function renderIssueMarkers() {
    clearIssueMarkerNodes();
    issueMarkers.forEach(function (item, index) {
      var node = el('div', 'f1ti-issue-marker is-' + item.type, (index + 1) + ' · ' + issueLabel(item.type));
      document.body.appendChild(node);
      issueMarkerNodes.push(node);
    });
    updateIssueMarkerPositions();
  }

  function renderIssueList() {
    if (!issueList) return;
    issueList.replaceChildren();
    if (!issueMarkers.length) {
      issueList.appendChild(el('p', 'f1ti-tuner__hint', '尚未标记问题。选择类型后，直接点击地图中的异常位置。'));
      renderIssueMarkers();
      return;
    }
    issueMarkers.forEach(function (item, index) {
      var row = el('div', 'f1ti-tuner__issue-row');
      var focus = el('button', 'f1ti-tuner__issue-focus', (index + 1) + '. ' + issueLabel(item.type) + '  X ' + item.x.toFixed(2) + ' · Y ' + item.y.toFixed(2) + ' · Z ' + item.z.toFixed(2));
      focus.type = 'button';
      focus.addEventListener('click', function () { api?.focusWorldPoint?.(item); });
      var remove = el('button', 'f1ti-tuner__issue-remove', '删除');
      remove.type = 'button';
      remove.addEventListener('click', function () {
        issueMarkers.splice(index, 1);
        saveIssueMarkers();
        renderIssueList();
        toast('已删除该问题标记');
      });
      row.appendChild(focus);
      row.appendChild(remove);
      issueList.appendChild(row);
    });
    renderIssueMarkers();
  }

  function addIssueMarker(point) {
    if (!point || issueMode === 'off') return;
    issueMarkers.push({
      id: Date.now().toString(36) + '-' + issueMarkers.length,
      type: issueMode,
      x: Number(point.x), y: Number(point.y), z: Number(point.z),
      createdAt: new Date().toISOString()
    });
    saveIssueMarkers();
    renderIssueList();
    toast('已标记' + issueLabel(issueMode) + ' #' + issueMarkers.length);
  }

  function flushMapDrag() {
    mapDragFrame = 0;
    if (!api || !mapDragDX && !mapDragDY) return;
    var dx = mapDragDX;
    var dy = mapDragDY;
    mapDragDX = 0;
    mapDragDY = 0;
    if (mapDragMode === 'pan') api.adjustMapView({ panX: -dx * 0.00035, panZ: dy * 0.00035 });
    else api.adjustMapView({ yaw: -dx * 0.0025, pitch: dy * 0.0025 });
  }

  function queueMapDrag(dx, dy) {
    mapDragDX += dx;
    mapDragDY += dy;
    if (!mapDragFrame) mapDragFrame = window.requestAnimationFrame(flushMapDrag);
  }

  var CAR_LABELS = {
    player: '玩家赛车',
    redbull: 'Red Bull',
    ferrari: 'Ferrari',
    creator: '创变者',
    mercedes: 'Mercedes'
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function numberField(label, key, value, step) {
    var wrap = el('label', 'f1ti-tuner__field');
    wrap.appendChild(el('span', '', label));
    var input = el('input');
    input.type = 'number';
    input.step = String(step);
    input.value = Number(value || 0).toFixed(step < 1 ? 2 : 1);
    input.dataset.key = key;
    input.addEventListener('keydown', function (event) { event.stopPropagation(); });
    wrap.appendChild(input);
    return wrap;
  }

  function value(key) {
    var input = panel?.querySelector('[data-key="' + key + '"]');
    return input ? Number(input.value) || 0 : 0;
  }

  function setValue(key, next) {
    var input = panel?.querySelector('[data-key="' + key + '"]');
    if (input) input.value = Number(next || 0).toFixed(Number(input.step) < 1 ? 2 : 1);
  }

  function toast(message, isError) {
    var note = panel?.querySelector('.f1ti-tuner__notice');
    if (!note) return;
    note.textContent = message;
    note.classList.toggle('is-error', Boolean(isError));
    window.clearTimeout(note._timer);
    note._timer = window.setTimeout(function () { note.textContent = ''; }, 2400);
  }

  function calibrationFromFields() {
    var state = api?.getState();
    var cars = Array.isArray(state?.cars) ? state.cars.map(function (car) {
      return { id: car.id, x: car.x, z: car.z, headingDeg: car.headingDeg };
    }) : [];
    var player = cars.find(function (car) { return car.id === 'player'; }) || state?.start || {
      x: value('start.x'), z: value('start.z'), headingDeg: value('start.headingDeg')
    };
    var selectedScale = {
      x: Math.max(0.05, value('carScale.x')),
      y: Math.max(0.05, value('carScale.y')),
      z: Math.max(0.05, value('carScale.z'))
    };
    var carScales = Object.assign({}, state?.carScales || {});
    carScales[selectedCarId] = selectedScale;
    return {
      gridRevision: state?.trackId === 'suzuka' ? 'suzuka-grid-40' : state?.trackId === 'marina-bay' ? 'marina-bay-grid-179' : undefined,
      carScale: carScales.player || selectedScale,
      carScales: carScales,
      start: {
        x: player.x,
        z: player.z,
        headingDeg: player.headingDeg
      },
      placements: cars,
      grid: {
        rowSpacing: Math.max(3, value('grid.rowSpacing')),
        laneSpacing: Math.max(1.2, value('grid.laneSpacing'))
      },
      placement: {
        x: value('placement.x'),
        z: value('placement.z'),
        y: value('placement.y'),
        yawDeg: value('placement.yawDeg'),
        scale: Math.max(0.01, value('placement.scale'))
      },
      updatedAt: new Date().toISOString()
    };
  }

  function applyPreview() {
    if (!api) return;
    var data = calibrationFromFields();
    api.pause();
    api.setPlacement(data.placement);
    api.setCarScale(selectedCarId, data.carScales[selectedCarId]);
    var pose = {
      x: value('start.x'),
      z: value('start.z'),
      headingDeg: value('start.headingDeg')
    };
    var ok = api.setCarPose ? api.setCarPose(selectedCarId, pose) : api.setStart(pose);
    toast(ok ? '已应用预览：' + (CAR_LABELS[selectedCarId] || selectedCarId) : '该坐标下未检测到地面，请调整 X / Z', !ok);
  }

  function closePanel() {
    window.clearInterval(liveTimer);
    liveTimer = 0;
    carDrag = false;
    panel?.remove();
    panel = null;
    marker?.remove();
    marker = null;
    issueMode = 'off';
    issueList = null;
    clearIssueMarkerNodes();
    if (launcher) launcher.style.display = '';
  }

  function section(title) {
    var block = el('section', 'f1ti-tuner__section');
    block.appendChild(el('h3', '', title));
    return block;
  }

  function openPanel() {
    if (!api || panel) return;
    api.pause();
    if (launcher) launcher.style.display = 'none';
    var state = api.getState();
    loadIssueMarkers();
    selectedCarId = state.selectedCarId || 'player';
    var saved = globalThis.__F1TI_TRACK_CONFIG__?.calibration || null;
    panel = el('aside', 'f1ti-tuner');
    panel.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
    panel.addEventListener('click', function (event) { event.stopPropagation(); });
    panel.addEventListener('wheel', function (event) { event.stopPropagation(); });

    var header = el('header', 'f1ti-tuner__header');
    var title = el('div');
    title.appendChild(el('small', '', 'TRACK & CAR CALIBRATION'));
    title.appendChild(el('h2', '', state.trackName + ' · 校准工作台'));
    header.appendChild(title);
    var close = el('button', 'f1ti-tuner__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭赛道校准');
    close.addEventListener('click', closePanel);
    header.appendChild(close);
    panel.appendChild(header);

    var trackSection = section('赛道与观察视角');
    var trackSelect = el('select', 'f1ti-tuner__select');
    trackSelect.setAttribute('aria-label', '选择要校准的赛道');
    (globalThis.__F1TI_TRACKS__ || []).forEach(function (track) {
      var option = el('option', '', track.name);
      option.value = track.id;
      option.selected = track.id === state.trackId;
      trackSelect.appendChild(option);
    });
    trackSelect.addEventListener('change', function () {
      localStorage.setItem('f1ti_selected_track_v1', trackSelect.value);
      location.href = location.pathname + '?trackTuner=1&track=' + encodeURIComponent(trackSelect.value);
    });
    trackSection.appendChild(trackSelect);
    var views = el('div', 'f1ti-tuner__views');
    [
      ['free', '自由地图'],
      ['overhead', '俯瞰视角'],
      ['chase', '追车视角'],
      ['cockpit', '赛车视角']
    ].forEach(function (entry) {
      var button = el('button', 'f1ti-tuner__view' + (state.view === entry[0] ? ' is-active' : ''), entry[1]);
      button.type = 'button';
      button.dataset.view = entry[0];
      button.addEventListener('click', function () {
        api.setView(entry[0]);
        views.querySelectorAll('.f1ti-tuner__view').forEach(function (item) {
          item.classList.toggle('is-active', item === button);
        });
      });
      views.appendChild(button);
    });
    trackSection.appendChild(views);
    var mapActions = el('div', 'f1ti-tuner__map-actions');
    var wholeTrack = el('button', 'f1ti-tuner__secondary', '查看整条赛道');
    wholeTrack.type = 'button';
    wholeTrack.addEventListener('click', function () {
      api.focusTrack();
      views.querySelectorAll('.f1ti-tuner__view').forEach(function (item) {
        item.classList.toggle('is-active', item.dataset.view === 'free');
      });
    });
    mapActions.appendChild(wholeTrack);
    var focusStart = el('button', 'f1ti-tuner__secondary', '定位起点 / 终点');
    focusStart.type = 'button';
    focusStart.addEventListener('click', function () {
      api.focusStart();
      views.querySelectorAll('.f1ti-tuner__view').forEach(function (item) {
        item.classList.toggle('is-active', item.dataset.view === 'free');
      });
    });
    mapActions.appendChild(focusStart);
    trackSection.appendChild(mapActions);
    var carPicker = el('label', 'f1ti-tuner__field f1ti-tuner__car-picker');
    carPicker.appendChild(el('span', '', '当前拖动车辆'));
    var carSelect = el('select', 'f1ti-tuner__select');
    carSelect.setAttribute('aria-label', '选择要拖动的赛车');
    (state.cars || []).forEach(function (car) {
      var option = el('option', '', CAR_LABELS[car.id] || car.id);
      option.value = car.id;
      option.selected = car.id === selectedCarId;
      carSelect.appendChild(option);
    });
    carPicker.appendChild(carSelect);
    trackSection.appendChild(carPicker);
    var dragCar = el('button', 'f1ti-tuner__drag-car', '拖动赛车：关闭');
    dragCar.type = 'button';
    dragCar.addEventListener('click', function () {
      carDrag = !carDrag;
      dragCar.textContent = '拖动赛车：' + (carDrag ? '开启' : '关闭');
      dragCar.classList.toggle('is-active', carDrag);
      if (carDrag) {
        api.focusStart();
        views.querySelectorAll('.f1ti-tuner__view').forEach(function (item) {
          item.classList.toggle('is-active', item.dataset.view === 'free');
        });
        toast('现在可拖动：' + (CAR_LABELS[selectedCarId] || selectedCarId));
      }
    });
    trackSection.appendChild(dragCar);
    var pickCoordinate = el('button', 'f1ti-tuner__secondary is-active', '点击显示坐标：开启');
    pickCoordinate.type = 'button';
    pickCoordinate.addEventListener('click', function () {
      coordinatePick = !coordinatePick;
      pickCoordinate.textContent = '点击显示坐标：' + (coordinatePick ? '开启' : '关闭');
      pickCoordinate.classList.toggle('is-active', coordinatePick);
    });
    trackSection.appendChild(pickCoordinate);
    coordinateResult = el('div', 'f1ti-tuner__live', '点击赛道路面后，将在这里显示 X / Y / Z 坐标');
    trackSection.appendChild(coordinateResult);
    trackSection.appendChild(el('p', 'f1ti-tuner__hint', '单击赛道路面读取坐标；拖动仍用于旋转视角。右键拖动平移，滚轮缩放。'));
    panel.appendChild(trackSection);

    var issueSection = section('穿模 / 颠簸问题标记');
    var issueModes = el('div', 'f1ti-tuner__issue-modes');
    [
      ['clipping', '标记穿模'],
      ['bump', '标记颠簸'],
      ['off', '停止标记']
    ].forEach(function (entry) {
      var button = el('button', 'f1ti-tuner__issue-mode' + (issueMode === entry[0] ? ' is-active' : ''), entry[1]);
      button.type = 'button';
      button.dataset.issueMode = entry[0];
      button.addEventListener('click', function () {
        issueMode = entry[0];
        carDrag = false;
        dragCar.textContent = '拖动赛车：关闭';
        dragCar.classList.remove('is-active');
        issueModes.querySelectorAll('.f1ti-tuner__issue-mode').forEach(function (item) {
          item.classList.toggle('is-active', item.dataset.issueMode === issueMode);
        });
        toast(issueMode === 'off' ? '已停止问题标记' : '请在地图上依次点击多个' + issueLabel(issueMode) + '位置');
      });
      issueModes.appendChild(button);
    });
    issueSection.appendChild(issueModes);
    issueSection.appendChild(el('p', 'f1ti-tuner__hint', '可连续点击多个位置；红色为穿模，黄色为颠簸。标记会按赛道自动保存，不会修改地图或车辆参数。'));
    issueList = el('div', 'f1ti-tuner__issue-list');
    issueSection.appendChild(issueList);
    var issueActions = el('div', 'f1ti-tuner__issue-actions');
    var exportIssues = el('button', 'f1ti-tuner__secondary', '导出全部标记 JSON');
    exportIssues.type = 'button';
    exportIssues.addEventListener('click', function () {
      var payload = JSON.stringify({
        trackId: state.trackId,
        trackName: state.trackName,
        markers: issueMarkers,
        exportedAt: new Date().toISOString()
      }, null, 2);
      var blob = new Blob([payload], { type: 'application/json' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'f1ti-' + state.trackId + '-issue-markers.json';
      link.click();
      window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
      toast('已导出 ' + issueMarkers.length + ' 个问题标记');
    });
    issueActions.appendChild(exportIssues);
    var clearIssues = el('button', 'f1ti-tuner__secondary f1ti-tuner__issue-clear', '清空标记');
    clearIssues.type = 'button';
    clearIssues.addEventListener('click', function () {
      if (!issueMarkers.length || !window.confirm('确定清空当前赛道的全部问题标记吗？')) return;
      issueMarkers = [];
      saveIssueMarkers();
      renderIssueList();
      toast('已清空当前赛道的问题标记');
    });
    issueActions.appendChild(clearIssues);
    issueSection.appendChild(issueActions);
    panel.appendChild(issueSection);
    renderIssueList();

    var live = el('div', 'f1ti-tuner__live');
    panel.appendChild(live);
    function updateLive() {
      if (!api || !panel) return;
      var currentState = api.getState();
      var current = currentState.selectedCar || currentState.player;
      live.textContent = (CAR_LABELS[current.id] || current.id || '车辆') + '实时坐标  X ' + current.x.toFixed(2) + '  ·  Z ' + current.z.toFixed(2) + '  ·  朝向 ' + current.headingDeg.toFixed(1) + '°';
      var point = api.projectSelected?.() || api.projectStart?.();
      if (marker && point) {
        marker.style.display = point.visible ? '' : 'none';
        marker.style.left = point.x + 'px';
        marker.style.top = point.y + 'px';
      }
      updateIssueMarkerPositions();
    }
    marker = el('div', 'f1ti-tuner-marker', '起点 / 终点');
    document.body.appendChild(marker);
    updateLive();
    liveTimer = window.setInterval(updateLive, 250);

    function syncSelectedCarFields(focus) {
      var currentState = api.getState();
      var current = currentState.selectedCar || currentState.player;
      if (!current) return;
      var currentScale = currentState.carScales?.[current.id] || currentState.carScale || { x: 1, y: 1, z: 1 };
      setValue('carScale.x', currentScale.x);
      setValue('carScale.y', currentScale.y);
      setValue('carScale.z', currentScale.z);
      setValue('start.x', current.x);
      setValue('start.z', current.z);
      setValue('start.headingDeg', current.headingDeg);
      marker.textContent = CAR_LABELS[current.id] || current.id;
      if (focus) api.focusStart();
      updateLive();
    }

    carSelect.addEventListener('change', function () {
      selectedCarId = carSelect.value;
      api.selectCar?.(selectedCarId);
      syncSelectedCarFields(true);
      toast('已选择：' + (CAR_LABELS[selectedCarId] || selectedCarId));
    });

    var carScale = state.carScales?.[selectedCarId] || saved?.carScales?.[selectedCarId] || saved?.carScale || state.carScale || { x: 1, y: 1, z: 1 };
    var carSection = section('赛车尺寸');
    var carGrid = el('div', 'f1ti-tuner__fields');
    carGrid.appendChild(numberField('宽度比例', 'carScale.x', carScale.x, 0.01));
    carGrid.appendChild(numberField('高度比例', 'carScale.y', carScale.y, 0.01));
    carGrid.appendChild(numberField('长度比例', 'carScale.z', carScale.z, 0.01));
    carSection.appendChild(carGrid);
    carSection.appendChild(el('p', 'f1ti-tuner__hint', '1.00 为赛车模型原始尺寸；可分别调整长、宽、高。'));
    panel.appendChild(carSection);

    var start = state.selectedCar || saved?.start || state.start;
    var startSection = section('所选车辆位置与朝向');
    var startGrid = el('div', 'f1ti-tuner__fields');
    startGrid.appendChild(numberField('起点 X', 'start.x', start.x, 0.1));
    startGrid.appendChild(numberField('起点 Z', 'start.z', start.z, 0.1));
    startGrid.appendChild(numberField('朝向角度', 'start.headingDeg', start.headingDeg, 1));
    startSection.appendChild(startGrid);
    var capture = el('button', 'f1ti-tuner__secondary', '使用车辆当前位置与朝向');
    capture.type = 'button';
    capture.addEventListener('click', function () {
      var currentState = api.getState();
      var current = currentState.selectedCar || currentState.player;
      setValue('start.x', current.x);
      setValue('start.z', current.z);
      setValue('start.headingDeg', current.headingDeg);
      toast('已读取：' + (CAR_LABELS[selectedCarId] || selectedCarId));
    });
    startSection.appendChild(capture);
    panel.appendChild(startSection);

    var gridData = saved?.grid || { rowSpacing: 8, laneSpacing: 2.1 };
    var gridSection = section('AI 发车格');
    var aiGrid = el('div', 'f1ti-tuner__fields f1ti-tuner__fields--two');
    aiGrid.appendChild(numberField('前后排间距', 'grid.rowSpacing', gridData.rowSpacing, 0.1));
    aiGrid.appendChild(numberField('左右车位间距', 'grid.laneSpacing', gridData.laneSpacing, 0.1));
    gridSection.appendChild(aiGrid);
    gridSection.appendChild(el('p', 'f1ti-tuner__hint', 'AI 发车格以玩家起点为基准，保存后下次进入该赛道生效。'));
    panel.appendChild(gridSection);

    var placement = saved?.placement || state.placement;
    var mapSection = section('地图整体位置');
    var mapGrid = el('div', 'f1ti-tuner__fields');
    mapGrid.appendChild(numberField('地图 X', 'placement.x', placement.x, 0.1));
    mapGrid.appendChild(numberField('地图 Z', 'placement.z', placement.z, 0.1));
    mapGrid.appendChild(numberField('地图 Y', 'placement.y', placement.y, 0.1));
    mapGrid.appendChild(numberField('地图旋转', 'placement.yawDeg', placement.yawDeg, 1));
    mapGrid.appendChild(numberField('地图缩放', 'placement.scale', placement.scale, 0.01));
    mapSection.appendChild(mapGrid);
    panel.appendChild(mapSection);

    var notice = el('div', 'f1ti-tuner__notice');
    notice.setAttribute('aria-live', 'polite');
    panel.appendChild(notice);
    var actions = el('footer', 'f1ti-tuner__actions');
    var preview = el('button', 'f1ti-tuner__preview', '立即应用预览');
    preview.type = 'button';
    preview.addEventListener('click', applyPreview);
    actions.appendChild(preview);
    var save = el('button', 'f1ti-tuner__save', '保存该赛道参数');
    save.type = 'button';
    save.addEventListener('click', function () {
      applyPreview();
      var data = calibrationFromFields();
      localStorage.setItem(PREFIX + state.trackId, JSON.stringify(data));
      globalThis.__F1TI_TRACK_CONFIG__.calibration = data;
      globalThis.__F1TI_TRACK_CONFIG__.placement = data.placement;
      globalThis.__F1TI_TRACK_CONFIG__.carScale = data.carScale;
      globalThis.__F1TI_TRACK_CONFIG__.carScales = data.carScales;
      toast('已保存：' + state.trackName + '（全部车辆位置）');
    });
    actions.appendChild(save);
    var reset = el('button', 'f1ti-tuner__reset', '恢复该赛道默认值');
    reset.type = 'button';
    reset.addEventListener('click', function () {
      localStorage.removeItem(PREFIX + state.trackId);
      location.reload();
    });
    actions.appendChild(reset);
    panel.appendChild(actions);
    document.body.appendChild(panel);
  }

  function install(nextApi) {
    api = nextApi;
    if (launcher) return;
    var params = new URLSearchParams(location.search);
    var tunerEnabled = params.has('trackTuner') || params.has('deleteObjectsGui') || params.has('routeDragGui');
    if (!tunerEnabled) return;
    launcher = el('button', 'f1ti-tuner-launch', '赛道校准');
    launcher.type = 'button';
    launcher.addEventListener('click', openPanel);
    document.body.appendChild(launcher);
    window.addEventListener('pointerdown', function (event) {
      if (!api || panel?.contains(event.target)) return;
      if (event.button !== 0 && event.button !== 2) return;
      if (carDrag && event.button === 0) {
        drag = { x: event.clientX, y: event.clientY, button: 'car' };
        (api.dragSelectedCarToScreen || api.dragCarToScreen)(event.clientX, event.clientY);
        var movedState = api.getState();
        var moved = movedState.selectedCar || movedState.player;
        setValue('start.x', moved.x);
        setValue('start.z', moved.z);
        event.preventDefault();
        return;
      }
      if (api.getState().view !== 'free' && !((coordinatePick || issueMode !== 'off') && event.button === 0)) return;
      drag = {
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        button: event.button
      };
      event.preventDefault();
    }, true);
    window.addEventListener('pointermove', function (event) {
      if (!drag || !api) return;
      var dx = event.clientX - drag.x;
      var dy = event.clientY - drag.y;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) drag.moved = true;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (drag.button === 'car') {
        (api.dragSelectedCarToScreen || api.dragCarToScreen)(event.clientX, event.clientY);
        var movedState = api.getState();
        var moved = movedState.selectedCar || movedState.player;
        setValue('start.x', moved.x);
        setValue('start.z', moved.z);
      } else if (api.getState().view === 'free') {
        mapDragMode = drag.button === 2 ? 'pan' : 'orbit';
        queueMapDrag(dx, dy);
      }
    }, true);
    window.addEventListener('pointerup', function (event) {
      var finishedDrag = drag;
      drag = null;
      if (mapDragFrame) {
        window.cancelAnimationFrame(mapDragFrame);
        mapDragFrame = 0;
        flushMapDrag();
      }
      if (finishedDrag && finishedDrag.button === 0 && !finishedDrag.moved && (coordinatePick || issueMode !== 'off') && api.pickWorldPoint) {
        var point = api.pickWorldPoint(event.clientX, event.clientY);
        if (point && issueMode !== 'off') addIssueMarker(point);
        if (point && coordinateResult) {
          coordinateResult.textContent = '点击坐标  X ' + point.x.toFixed(2) + '  ·  Y ' + point.y.toFixed(2) + '  ·  Z ' + point.z.toFixed(2);
        } else if (coordinateResult) {
          coordinateResult.textContent = '该位置未检测到赛道路面，请点击可见路面';
        }
      }
    }, true);
    window.addEventListener('pointercancel', function () {
      drag = null;
      mapDragDX = 0;
      mapDragDY = 0;
      if (mapDragFrame) window.cancelAnimationFrame(mapDragFrame);
      mapDragFrame = 0;
    }, true);
    window.addEventListener('wheel', function (event) {
      if (!api || api.getState().view !== 'free' || panel?.contains(event.target)) return;
      api.adjustMapView({ zoom: Math.exp(event.deltaY * 0.0005) });
      event.preventDefault();
    }, { passive: false, capture: true });
    window.addEventListener('contextmenu', function (event) {
      if (api?.getState().view === 'free' && !panel?.contains(event.target)) event.preventDefault();
    }, true);
    if (params.has('trackTuner')) {
      launcher.classList.add('is-direct');
      window.requestAnimationFrame(openPanel);
    }
  }

  window.addEventListener('f1ti:track-tuner-ready', function () {
    if (globalThis.__F1TI_TRACK_TUNER_API__) install(globalThis.__F1TI_TRACK_TUNER_API__);
  });
  if (globalThis.__F1TI_TRACK_TUNER_API__) install(globalThis.__F1TI_TRACK_TUNER_API__);
}());
