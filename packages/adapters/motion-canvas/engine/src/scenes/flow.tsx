import {makeScene2D, Rect, Txt, Line} from '@motion-canvas/2d';
import {all, createRef, waitFor} from '@motion-canvas/core';
import scene from '../scene.json';

export default makeScene2D(function* (view) {
  const {width, height, theme, nodes, title, duration} = scene;
  const unit = Math.min(width, height);
  view.fill(theme.bg);

  const landscape = width >= height;
  const gap = width * (landscape ? 0.215 : 0);
  const startX = -gap * ((nodes.length - 1) / 2);
  const nodeWidth = landscape ? width * 0.15 : width * 0.62;
  const nodeHeight = landscape ? height * 0.17 : height * 0.095;
  const stepY = height * (landscape ? 0.2 : 0.16);
  const titleY = landscape ? -height * 0.33 : -height * 0.4;
  const eyebrowY = landscape ? -height * 0.4 : -height * 0.455;

  const eyebrow = createRef<Txt>();
  const titleRef = createRef<Txt>();
  const tag = createRef<Txt>();

  view.add(<Txt ref={eyebrow} text={scene.eyebrow ?? 'MOTION CANVAS'} y={eyebrowY} fontSize={unit * 0.022} fontFamily={theme.font} fill={theme.accent2} letterSpacing={6} opacity={0} />);
  view.add(<Txt ref={titleRef} text={title} y={titleY} fontSize={unit * 0.056} fontFamily={theme.font} fill={theme.fg} fontWeight={700} opacity={0} />);

  const boxes = nodes.map(() => createRef<Rect>());
  nodes.forEach((node, index) => {
    view.add(
      <Rect
        ref={boxes[index]}
        x={landscape ? startX + gap * index : 0}
        y={landscape ? height * 0.02 : -stepY * ((nodes.length - 1) / 2) + stepY * index}
        width={nodeWidth}
        height={nodeHeight}
        radius={unit * 0.016}
        fill={theme.bg}
        stroke={node.color ?? theme.accent}
        lineWidth={2}
        opacity={0}
        scale={0.92}
      >
        <Txt text={node.label} fontSize={unit * 0.026} fontFamily={theme.font} fill={theme.fg} fontWeight={650} textWrap width={nodeWidth * 0.82} textAlign={'center'} />
        {node.note ? <Txt text={node.note} y={nodeHeight * 0.27} fontSize={unit * 0.017} fontFamily={theme.font} fill={theme.muted} textWrap width={nodeWidth * 0.8} textAlign={'center'} /> : null}
      </Rect>,
    );
  });

  const lines = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const line = createRef<Line>();
    lines.push(line);
    view.add(
      <Line
        ref={line}
        points={landscape ? [() => boxes[i]().right(), () => boxes[i + 1]().left()] : [() => boxes[i]().bottom(), () => boxes[i + 1]().top()]}
        stroke={theme.accent2}
        lineWidth={unit * 0.003}
        end={0}
      />,
    );
  }

  view.add(<Txt ref={tag} text={'MOTION CANVAS'} y={height * 0.44} fontSize={unit * 0.017} fontFamily={theme.font} fill={theme.muted} letterSpacing={5} opacity={0} />);

  yield* all(eyebrow().opacity(1, 0.4), titleRef().opacity(1, 0.5));
  for (const box of boxes) yield* all(box().opacity(1, 0.3), box().scale(1, 0.3));
  for (const line of lines) yield* line().end(1, 0.22);
  yield* all(tag().opacity(1, 0.35), waitFor(0.3));
  yield* waitFor(duration);
});
