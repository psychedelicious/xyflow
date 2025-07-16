import { type MouseEvent, type KeyboardEvent, useMemo, useCallback } from 'react';
import cc from 'classcat';
import { shallow } from 'zustand/shallow';
import {
  elementSelectionKeys,
  errorMessages,
  getNodeDimensions,
  isInputDOMNode,
  nodeHasDimensions,
  getNodesInside,
} from '@xyflow/system';

import { useStore, useStoreApi } from '../../hooks/useStore';
import { Provider } from '../../contexts/NodeIdContext';
import { ARIA_NODE_DESC_KEY } from '../A11yDescriptions';
import { useDrag } from '../../hooks/useDrag';
import { useMoveSelectedNodes } from '../../hooks/useMoveSelectedNodes';
import { handleNodeClick } from '../Nodes/utils';
import { arrowKeyDiffs, builtinNodeTypes, getNodeInlineStyleDimensions } from './utils';
import { useNodeObserver } from './useNodeObserver';
import type { InternalNode, Node, NodeWrapperProps, ReactFlowState } from '../../types';
import { Selector, createSelector } from 'reselect';

type NodeSelector<NodeType extends Node> = (s: ReactFlowState) => InternalNode<NodeType>;

const buildSelectNode =
  <NodeType extends Node>(id: string) =>
  (s: ReactFlowState) =>
    s.nodeLookup.get(id) as InternalNode<NodeType>;
const buildSelectIsParent = (id: string) => (s: ReactFlowState) => s.parentLookup.has(id);
const buildSelectIsHidden = <NodeType extends Node>(selectNode: NodeSelector<NodeType>) =>
  createSelector(selectNode, (node) => node.hidden);
const buildSelectNodeHasDimensions = <NodeType extends Node>(selectNode: NodeSelector<NodeType>) =>
  createSelector(selectNode, (node) => nodeHasDimensions(node));
const buildSelectNodeDimensions = <NodeType extends Node>(selectNode: NodeSelector<NodeType>) =>
  createSelector(selectNode, (node) => getNodeDimensions(node));
const buildSelectNodeInlineStyleDimensions = <NodeType extends Node>(selectNode: NodeSelector<NodeType>) =>
  createSelector(selectNode, (node) => getNodeInlineStyleDimensions(node));
const buildSelectIsDraggable = <NodeType extends Node>(selectNode: NodeSelector<NodeType>, nodesDraggable: boolean) =>
  createSelector(selectNode, (node) => !!(node.draggable || (nodesDraggable && typeof node.draggable === 'undefined')));
const buildSelectIsSelectable = <NodeType extends Node>(
  selectNode: NodeSelector<NodeType>,
  elementsSelectable: boolean
) =>
  createSelector(
    selectNode,
    (node) => !!(node.selectable || (elementsSelectable && typeof node.selectable === 'undefined'))
  );
const buildSelectIsConnectable = <NodeType extends Node>(
  selectNode: NodeSelector<NodeType>,
  nodesConnectable: boolean
) =>
  createSelector(
    selectNode,
    (node) => !!(node.connectable || (nodesConnectable && typeof node.connectable === 'undefined'))
  );
const buildSelectIsFocusable = <NodeType extends Node>(selectNode: NodeSelector<NodeType>, nodesFocusable: boolean) =>
  createSelector(selectNode, (node) => !!(node.focusable || (nodesFocusable && typeof node.focusable === 'undefined')));

export function NodeWrapper<NodeType extends Node>(props: NodeWrapperProps<NodeType>) {
  const selectNode = useMemo(() => buildSelectNode<NodeType>(props.id), [props.id]);
  const selectIsHidden = useMemo(() => buildSelectIsHidden(selectNode), [selectNode]);
  const isHidden = useStore(selectIsHidden);

  if (isHidden) {
    return null;
  }

  return <VisibleNodeWrapper {...props} selectNode={selectNode} />;
}

export function VisibleNodeWrapper<NodeType extends Node>({
  id,
  onClick,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  onContextMenu,
  onDoubleClick,
  nodesDraggable,
  elementsSelectable,
  nodesConnectable,
  nodesFocusable,
  resizeObserver,
  noDragClassName,
  noPanClassName,
  disableKeyboardA11y,
  rfId,
  nodeTypes,
  nodeClickDistance,
  onError,
  selectNode,
}: NodeWrapperProps<NodeType> & { selectNode: NodeSelector<NodeType> }) {
  const selectIsParent = useMemo(() => buildSelectIsParent(id), [id]);
  const selectNodeHasDimensions = useMemo(() => buildSelectNodeHasDimensions<NodeType>(selectNode), [selectNode]);
  const selectNodeDimensions = useMemo(() => buildSelectNodeDimensions<NodeType>(selectNode), [selectNode]);
  const selectNodeInlineStyleDimensions = useMemo(
    () => buildSelectNodeInlineStyleDimensions<NodeType>(selectNode),
    [selectNode]
  );
  const selectIsDraggable = useMemo(
    () => buildSelectIsDraggable<NodeType>(selectNode, nodesDraggable),
    [selectNode, nodesDraggable]
  );
  const selectIsSelectable = useMemo(
    () => buildSelectIsSelectable<NodeType>(selectNode, elementsSelectable),
    [selectNode, elementsSelectable]
  );
  const selectIsConnectable = useMemo(
    () => buildSelectIsConnectable<NodeType>(selectNode, nodesConnectable),
    [selectNode, nodesConnectable]
  );
  const selectIsFocusable = useMemo(
    () => buildSelectIsFocusable<NodeType>(selectNode, nodesFocusable),
    [selectNode, nodesFocusable]
  );

  const node = useStore(selectNode);
  const isParent = useStore(selectIsParent);
  const hasDimensions = useStore(selectNodeHasDimensions);
  const nodeDimensions = useStore(selectNodeDimensions, shallow);
  const inlineDimensions = useStore(selectNodeInlineStyleDimensions, shallow);

  const isDraggable = useStore(selectIsDraggable);
  const isSelectable = useStore(selectIsSelectable);
  const isConnectable = useStore(selectIsConnectable);
  const isFocusable = useStore(selectIsFocusable);

  let nodeType = node.type || 'default';
  let NodeComponent = nodeTypes?.[nodeType] || builtinNodeTypes[nodeType];

  if (NodeComponent === undefined) {
    onError?.('003', errorMessages['error003'](nodeType));
    nodeType = 'default';
    NodeComponent = nodeTypes?.['default'] || builtinNodeTypes.default;
  }

  const store = useStoreApi();
  const nodeRef = useNodeObserver({ node, nodeType, hasDimensions, resizeObserver });
  const dragging = useDrag({
    nodeRef,
    disabled: node.hidden || !isDraggable,
    noDragClassName,
    handleSelector: node.dragHandle,
    nodeId: id,
    isSelectable,
    nodeClickDistance,
  });
  const moveSelectedNodes = useMoveSelectedNodes();

  const hasPointerEvents = useMemo(
    () => isSelectable || isDraggable || onClick || onMouseEnter || onMouseMove || onMouseLeave,
    [isSelectable, isDraggable, onClick, onMouseEnter, onMouseMove, onMouseLeave]
  );

  const onMouseEnterHandler = useMemo(() => {
    if (!onMouseEnter) {
      return;
    }
    return (event: MouseEvent) => {
      const node = selectNode(store.getState());
      onMouseEnter(event, { ...node.internals.userNode });
    };
  }, [store, onMouseEnter, selectNode]);

  const onMouseMoveHandler = useMemo(() => {
    if (!onMouseMove) {
      return;
    }
    return (event: MouseEvent) => {
      const node = selectNode(store.getState());
      onMouseMove(event, { ...node.internals.userNode });
    };
  }, [store, onMouseMove, selectNode]);
  const onMouseLeaveHandler = useMemo(() => {
    if (!onMouseLeave) {
      return;
    }
    return (event: MouseEvent) => {
      const node = selectNode(store.getState());
      onMouseLeave(event, { ...node.internals.userNode });
    };
  }, [store, onMouseLeave, selectNode]);
  const onContextMenuHandler = useMemo(() => {
    if (!onContextMenu) {
      return;
    }
    return (event: MouseEvent) => {
      const node = selectNode(store.getState());
      onContextMenu(event, { ...node.internals.userNode });
    };
  }, [store, onContextMenu, selectNode]);
  const onDoubleClickHandler = useMemo(() => {
    if (!onDoubleClick) {
      return;
    }
    return (event: MouseEvent) => {
      const node = selectNode(store.getState());
      onDoubleClick(event, { ...node.internals.userNode });
    };
  }, [store, onDoubleClick, selectNode]);

  const onSelectNodeHandler = useCallback(
    (event: MouseEvent) => {
      const s = store.getState();
      const { selectNodesOnDrag, nodeDragThreshold } = store.getState();
      const node = selectNode(s);
      const isDraggable = selectIsDraggable(s);
      const isSelectable = selectIsSelectable(s);

      if (isSelectable && (!selectNodesOnDrag || !isDraggable || nodeDragThreshold > 0)) {
        /*
         * this handler gets called by XYDrag on drag start when selectNodesOnDrag=true
         * here we only need to call it when selectNodesOnDrag=false
         */
        handleNodeClick({
          id,
          store,
          nodeRef,
        });
      }

      if (onClick) {
        onClick(event, { ...node.internals.userNode });
      }
    },
    [store, selectNode, selectIsDraggable, selectIsSelectable, onClick]
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (isInputDOMNode(event.nativeEvent) || disableKeyboardA11y) {
        return;
      }

      const s = store.getState();

      const node = selectNode(s);

      if (elementSelectionKeys.includes(event.key) && selectIsSelectable(s)) {
        const unselect = event.key === 'Escape';

        handleNodeClick({
          id,
          store,
          unselect,
          nodeRef,
        });
      } else if (
        selectIsDraggable(s) &&
        node.selected &&
        Object.prototype.hasOwnProperty.call(arrowKeyDiffs, event.key)
      ) {
        // prevent default scrolling behavior on arrow key press when node is moved
        event.preventDefault();

        const { ariaLabelConfig } = s;

        store.setState({
          ariaLiveMessage: ariaLabelConfig['node.a11yDescription.ariaLiveMessage']({
            direction: event.key.replace('Arrow', '').toLowerCase(),
            x: ~~node.internals.positionAbsolute.x,
            y: ~~node.internals.positionAbsolute.y,
          }),
        });

        moveSelectedNodes({
          direction: arrowKeyDiffs[event.key],
          factor: event.shiftKey ? 4 : 1,
        });
      }
    },
    [id, store, selectNode, selectIsSelectable, selectIsDraggable, disableKeyboardA11y, arrowKeyDiffs]
  );

  const onFocus = useCallback(() => {
    if (disableKeyboardA11y || !nodeRef.current?.matches(':focus-visible')) {
      return;
    }

    const s = store.getState();
    const { transform, width, height, autoPanOnNodeFocus, setCenter } = s;

    if (!autoPanOnNodeFocus) {
      return;
    }

    const node = selectNode(s);
    const nodeDimensions = selectNodeDimensions(s);

    const withinViewport =
      getNodesInside(new Map([[id, node]]), { x: 0, y: 0, width, height }, transform, true).length > 0;

    if (!withinViewport) {
      setCenter(node.position.x + nodeDimensions.width / 2, node.position.y + nodeDimensions.height / 2, {
        zoom: transform[2],
      });
    }
  }, [id, store, selectNode, selectNodeDimensions, disableKeyboardA11y]);

  const className = useMemo(
    () =>
      cc([
        'react-flow__node',
        `react-flow__node-${nodeType}`,
        {
          // this is overwritable by passing `nopan` as a class name
          [noPanClassName]: isDraggable,
        },
        node.className,
        {
          selected: node.selected,
          selectable: isSelectable,
          parent: isParent,
          draggable: isDraggable,
          dragging,
        },
      ]),
    [nodeType, noPanClassName, isDraggable, node.className, node.selected, isSelectable, isParent, dragging]
  );

  return (
    <div
      className={className}
      ref={nodeRef}
      style={{
        zIndex: node.internals.z,
        transform: `translate(${node.internals.positionAbsolute.x}px,${node.internals.positionAbsolute.y}px)`,
        pointerEvents: hasPointerEvents ? 'all' : 'none',
        visibility: hasDimensions ? 'visible' : 'hidden',
        ...node.style,
        ...inlineDimensions,
      }}
      data-id={id}
      data-testid={`rf__node-${id}`}
      onMouseEnter={onMouseEnterHandler}
      onMouseMove={onMouseMoveHandler}
      onMouseLeave={onMouseLeaveHandler}
      onContextMenu={onContextMenuHandler}
      onClick={onSelectNodeHandler}
      onDoubleClick={onDoubleClickHandler}
      onKeyDown={isFocusable ? onKeyDown : undefined}
      tabIndex={isFocusable ? 0 : undefined}
      onFocus={isFocusable ? onFocus : undefined}
      role={node.ariaRole ?? (isFocusable ? 'group' : undefined)}
      aria-roledescription="node"
      aria-describedby={disableKeyboardA11y ? undefined : `${ARIA_NODE_DESC_KEY}-${rfId}`}
      aria-label={node.ariaLabel}
      {...node.domAttributes}
    >
      <Provider value={id}>
        <NodeComponent
          id={id}
          data={node.data}
          type={nodeType}
          positionAbsoluteX={node.internals.positionAbsolute.x}
          positionAbsoluteY={node.internals.positionAbsolute.y}
          selected={node.selected ?? false}
          selectable={isSelectable}
          draggable={isDraggable}
          deletable={node.deletable ?? true}
          isConnectable={isConnectable}
          sourcePosition={node.sourcePosition}
          targetPosition={node.targetPosition}
          dragging={dragging}
          dragHandle={node.dragHandle}
          zIndex={node.internals.z}
          parentId={node.parentId}
          {...nodeDimensions}
        />
      </Provider>
    </div>
  );
}
