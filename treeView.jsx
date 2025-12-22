import React, { useState } from "react";
import DragHierarchyTree from "react-drag-hierarchy-tree";

const initialTreeData = [
  {
    id: "1",
    title: "Epic 1",
    children: [
      {
        id: "1-1",
        title: "Feature 1",
        children: [
          { id: "1-1-1", title: "Story 1" },
          { id: "1-1-2", title: "Story 2" }
        ]
      },
      {
        id: "1-2",
        title: "Feature 2",
        children: [
          { id: "1-2-1", title: "Story 3" },
          { id: "1-2-2", title: "Story 4" }
        ]
      }
    ]
  },
  {
    id: "2",
    title: "Epic 2",
    children: [
      {
        id: "2-1",
        title: "Feature 3",
        children: [
          { id: "2-1-1", title: "Story 5" }
        ]
      }
    ]
  }
];

export default function MyTree() {
  const [treeData, setTreeData] = useState(() => JSON.parse(JSON.stringify(initialTreeData)));

  const handleChange = (newTree) => {
    if (!Array.isArray(newTree)) {
      console.error("Invalid tree data:", newTree);
      return;
    }

    const isValid = (nodes) =>
      nodes.every((node) =>
        typeof node === "object" &&
        typeof node.id === "string" &&
        typeof node.title === "string" &&
        (!node.children || (Array.isArray(node.children) && isValid(node.children)))
      );

    if (isValid(newTree)) {
      setTreeData(newTree);
      console.log("Updated Tree:", newTree);
    } else {
      console.error("Tree structure validation failed.", newTree);
    }
  };

  return (
    <div style={{ padding: "1rem", height: "600px", overflow: "auto" }}>
      <DragHierarchyTree
        treeData={treeData}
        onChange={handleChange}
        treeStyles={{ width: "100%" }}
      />
    </div>
  );
}