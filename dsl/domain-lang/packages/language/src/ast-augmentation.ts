declare module './generated/ast.js' {
    interface DirectionalRelationship {
        /** SDK-inferred relationship kind based on patterns and arrow */
        inferredKind?: string;
    }
    interface SymmetricRelationship {
        /** SDK-inferred relationship kind from pattern or >< arrow */
        inferredKind?: string;
    }
}