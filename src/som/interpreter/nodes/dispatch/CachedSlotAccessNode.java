package som.interpreter.nodes.dispatch;

import som.interpreter.objectstorage.FieldAccess.AbstractFieldRead;
import som.interpreter.objectstorage.FieldAccess.AbstractWriteFieldNode;
import som.vmobjects.SObject;
import som.vmobjects.SObject.SMutableObject;

import com.oracle.truffle.api.CompilerDirectives;
import com.oracle.truffle.api.frame.VirtualFrame;
import com.oracle.truffle.api.nodes.InvalidAssumptionException;


public abstract class CachedSlotAccessNode extends AbstractDispatchNode {

  @Child protected AbstractFieldRead read;

  public CachedSlotAccessNode(final AbstractFieldRead read) {
    this.read = read;
  }

  public static final class CachedSlotRead extends CachedSlotAccessNode {
    @Child protected AbstractDispatchNode nextInCache;

    private final DispatchGuard           guard;

    public CachedSlotRead(final AbstractFieldRead read,
        final DispatchGuard guard, final AbstractDispatchNode nextInCache) {
      super(read);
      this.guard       = guard;
      this.nextInCache = nextInCache;
      assert nextInCache != null;
    }

    // TODO: when we have this layout check here, do we need it later in the access node?
    //       do we need to move the logic for dropping specializations for old layouts here?

    @Override
    public Object executeDispatch(final VirtualFrame frame,
        final Object[] arguments) {
      try {
        // TODO: make sure this cast is always eliminated, otherwise, we need two versions mut/immut
        if (guard.entryMatches(arguments[0])) {
          return read.read(frame, ((SObject) arguments[0]));
        } else {
          return nextInCache.executeDispatch(frame, arguments);
        }
      } catch (InvalidAssumptionException e) {
        CompilerDirectives.transferToInterpreter();
        return replace(nextInCache).
            executeDispatch(frame, arguments);
      }
    }

    @Override
    public int lengthOfDispatchChain() {
      return 1 + nextInCache.lengthOfDispatchChain();
    }
  }

  public static final class LexicallyBoundMutableSlotWrite
    extends AbstractDispatchNode {

    @Child protected AbstractWriteFieldNode write;

    public LexicallyBoundMutableSlotWrite(final AbstractWriteFieldNode write) {
      this.write = write;
    }

    @Override
    public Object executeDispatch(final VirtualFrame frame,
        final Object[] arguments) {
      SMutableObject rcvr = (SMutableObject) arguments[0];
      return write.write(rcvr, arguments[1]);
    }

    @Override
    public int lengthOfDispatchChain() { return 1; }
  }

  public static final class CachedSlotWrite extends AbstractDispatchNode {
    @Child protected AbstractDispatchNode   nextInCache;
    @Child protected AbstractWriteFieldNode write;

    private final DispatchGuard             guard;

    public CachedSlotWrite(final AbstractWriteFieldNode write,
        final DispatchGuard guard,
        final AbstractDispatchNode nextInCache) {
      this.write = write;
      this.guard = guard;
      this.nextInCache = nextInCache;
    }

    @Override
    public Object executeDispatch(final VirtualFrame frame,
        final Object[] arguments) {
      try {
        if (guard.entryMatches(arguments[0])) {
          return write.write((SMutableObject) arguments[0], arguments[1]);
        } else {
          return nextInCache.executeDispatch(frame, arguments);
        }
      } catch (InvalidAssumptionException e) {
        CompilerDirectives.transferToInterpreter();
        return replace(nextInCache).executeDispatch(frame, arguments);
      }
    }

    @Override
    public int lengthOfDispatchChain() {
      return 1 + nextInCache.lengthOfDispatchChain();
    }
  }
}
