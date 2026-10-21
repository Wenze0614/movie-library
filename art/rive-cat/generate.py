"""
Generates scene.rml for the 2D cat (Rive). Run from this folder:

    python3 generate.py && rive . --verify

Artboard is 600 x 480. y = 290 is the sill line: the cat lies on it and the
tail hangs below it, over the sill's front edge. The web app positions the
artboard so that line lands on the 3D sill (see src/three/Experience.ts).
"""
import math

import os

PI = math.pi
LAMP_DEFAULT = os.environ.get("LAMP_DEFAULT", "true")  # set to false to preview the lamp-off look
BLACK = "FF0E0B0A"
WARM_RIM = "C8FFB066"
COOL_RIM = "908FA8FF"
CLEAR_WARM = "00FFB066"


def v_cubic(x, y, rot, dist, name=None, vid=None):
    attrs = f'x="{x}" y="{y}" rotation="{rot:.4f}" distance="{dist}"'
    if vid:
        attrs += f' id="{vid}"'
    if name:
        attrs += f' name="{name}"'
    return f"<CubicMirroredVertex {attrs}/>"


def v_straight(x, y, radius=0):
    return f'<StraightVertex x="{x}" y="{y}" radius="{radius}"/>'


def rim_stroke(sx, sy, ex, ey, stop_id, thickness=2.5, fade_from=0.55):
    """A soft stroke whose gradient fades in towards the lit edge."""
    return f"""
        <Stroke thickness="{thickness}" name="Rim">
            <Feather strength="2.5" name="Soft"/>
            <LinearGradient startX="{sx}" startY="{sy}" endX="{ex}" endY="{ey}" name="RimGradient">
                <GradientStop colorValue="{CLEAR_WARM}" position="0"/>
                <GradientStop colorValue="{CLEAR_WARM}" position="{fade_from}"/>
                <GradientStop colorValue="{WARM_RIM}" position="1" id="{stop_id}"/>
            </LinearGradient>
        </Stroke>"""


def soft_edge():
    """A feathered black stroke on the silhouette, so edges read painted, not vector."""
    return f"""
        <Stroke thickness="3" name="SoftEdge">
            <SolidColor colorValue="{BLACK}" name="C"/>
            <Feather strength="2" name="F"/>
        </Stroke>"""


def eye(node_id, x, rot, lid_id, lash_id):
    almond = f"""
            <PointsPath isClosed="true" name="Almond">
                {v_straight(-20, 0)}
                {v_cubic(0, -12.5, 0, 11)}
                {v_straight(20, 0)}
                {v_cubic(0, 12.5, PI, 11)}
            </PointsPath>"""
    return f"""
    <Node x="{x}" y="-4" rotation="{rot}" name="Eye" id="{node_id}">
        <Shape y="-4" name="Lid" id="{lid_id}">
            <Rectangle width="52" height="32" originX="0.5" originY="1" name="Path"/>
            <Fill name="Fill"><SolidColor colorValue="{BLACK}" name="C"/></Fill>
        </Shape>
        <Shape opacity="0" name="Lash" id="{lash_id}">
            <PointsPath isClosed="false" name="Path">
                {v_straight(-19, 2)}
                {v_cubic(0, 7, 0, 10)}
                {v_straight(19, 2)}
            </PointsPath>
            <Stroke thickness="2" cap="round" name="Stroke"><SolidColor colorValue="FF9A8270" name="C"/></Stroke>
        </Shape>
        <Shape x="5" y="1" name="Catchlight">
            <Ellipse width="3" height="3" originX="0.5" originY="0.5" name="Path"/>
            <Fill name="Fill"><SolidColor colorValue="CCFFF6E0" name="C"/></Fill>
        </Shape>
        <Shape name="Pupil">
            <Ellipse width="6.5" height="19" originX="0.5" originY="0.5" name="Path"/>
            <Fill name="Fill"><SolidColor colorValue="FF140C08" name="C"/></Fill>
        </Shape>
        <Shape name="Ball">{almond}
            <Fill name="Fill">
                <RadialGradient startX="2" startY="-3" endX="22" endY="-3" name="G">
                    <GradientStop colorValue="FFFFD64D" position="0"/>
                    <GradientStop colorValue="FFF2A51E" position="0.7"/>
                    <GradientStop colorValue="FFD9801A" position="1"/>
                </RadialGradient>
            </Fill>
        </Shape>
    </Node>"""


def ear(node_id, x, y, rot, name):
    return f"""
    <Node x="{x}" y="{y}" rotation="{rot}" name="{name}" id="{node_id}">
        <Shape name="Inner">
            <PointsPath isClosed="true" name="Path">
                {v_straight(-11, 4, 3)}
                {v_straight(1, -32, 5)}
                {v_straight(13, 4, 3)}
            </PointsPath>
            <Fill name="Fill"><SolidColor colorValue="FF2B1E19" name="C"/></Fill>
        </Shape>
        <Shape name="Outer">
            <PointsPath isClosed="true" name="Path">
                {v_straight(-24, 12, 4)}
                {v_straight(1, -48, 7)}
                {v_straight(26, 10, 4)}
            </PointsPath>
            <Fill name="Fill"><SolidColor colorValue="{BLACK}" name="C"/></Fill>
        </Shape>
    </Node>"""


def whisker(x0, y0, x1, y1, bend):
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2 + bend
    ang = math.atan2(y1 - y0, x1 - x0)
    return f"""
            <PointsPath isClosed="false" name="W">
                {v_straight(x0, y0)}
                {v_cubic(mx, my, ang, abs(x1 - x0) / 4)}
                {v_straight(x1, y1)}
            </PointsPath>"""


head = f"""
<Node x="470" y="192" name="Head" id="0:10">
<Node name="HeadPose" id="0:15">
    <Shape name="Whiskers">
        {whisker(-16, 26, -96, 12, -4)}
        {whisker(-16, 29, -100, 28, -2)}
        {whisker(-15, 32, -92, 44, 2)}
        {whisker(16, 26, 96, 10, -4)}
        {whisker(16, 29, 102, 26, -2)}
        {whisker(15, 32, 96, 42, 2)}
        <Stroke thickness="1.3" cap="round" name="Stroke"><SolidColor colorValue="D9EFE6D8" name="C"/></Stroke>
    </Shape>
    {eye("0:20", -27, 0.14, "0:21", "0:22")}
    {eye("0:30", 27, -0.14, "0:31", "0:32")}
    <Shape x="0" y="18" name="Nose">
        <PointsPath isClosed="true" name="Path">
            {v_straight(-5, -3, 1.5)}
            {v_straight(5, -3, 1.5)}
            {v_straight(0, 3, 1)}
        </PointsPath>
        <Fill name="Fill"><SolidColor colorValue="FFDB8B6C" name="C"/></Fill>
    </Shape>
    <Shape name="Face" id="0:11">
        <PointsPath isClosed="true" name="Path">
            {v_cubic(0, -62, 0, 44)}
            {v_cubic(76, 2, PI / 2, 38)}
            {v_cubic(0, 60, PI, 46)}
            {v_cubic(-76, 2, -PI / 2, 38)}
        </PointsPath>
        <Fill name="Fill"><SolidColor colorValue="{BLACK}" name="C"/></Fill>
        {soft_edge()}
        {rim_stroke(-30, 30, 40, -60, "0:12", fade_from=0.72)}
    </Shape>
    {ear("0:13", -46, -44, -0.3, "EarL")}
    {ear("0:14", 46, -46, 0.3, "EarR")}
</Node>
</Node>
"""

def paw(x, y, reach, name, rim_id=None):
    """A front paw seen from the side: flat underneath, rounded at the toes."""
    rim = ""
    if rim_id:
        rim = f"""
    <Stroke thickness="2" name="Rim">
        <Feather strength="2" name="Soft"/>
        <LinearGradient startX="0" startY="8" endX="0" endY="-14" name="RimGradient">
            <GradientStop colorValue="{CLEAR_WARM}" position="0"/>
            <GradientStop colorValue="{CLEAR_WARM}" position="0.62"/>
            <GradientStop colorValue="{WARM_RIM}" position="1" id="{rim_id}"/>
        </LinearGradient>
    </Stroke>"""
    return f"""
<Shape x="{x}" y="{y}" name="{name}">
    <PointsPath isClosed="true" name="Path">
        {v_straight(-46, -13)}
        {v_cubic(reach - 24, -13, 0.04, 20)}
        {v_cubic(reach, -1, PI / 2, 9)}
        {v_cubic(reach - 20, 10, PI, 14)}
        {v_straight(-46, 10)}
    </PointsPath>
    <Fill name="Fill"><SolidColor colorValue="{BLACK}" name="C"/></Fill>
    {soft_edge()}{rim}
</Shape>"""


paws = f"""
<Shape x="470" y="281" name="Toes">
    <PointsPath isClosed="false" name="T1">{v_straight(52, -12)}{v_cubic(53, -8, 1.4, 2)}{v_straight(55, -3)}</PointsPath>
    <PointsPath isClosed="false" name="T2">{v_straight(61, -10)}{v_cubic(62, -7, 1.4, 2)}{v_straight(63, -2)}</PointsPath>
    <Stroke thickness="1.5" cap="round" name="Stroke"><SolidColor colorValue="FF2E2420" name="C"/></Stroke>
</Shape>
{paw(470, 281, 72, "PawFront", "0:52")}
{paw(452, 276, 58, "PawBack")}
"""

torso = f"""
<Node x="260" y="290" name="Torso" id="0:60">
    <Shape name="Haunch">
        <PointsPath isClosed="false" name="Path">
            {v_straight(-168, -10)}
            {v_cubic(-128, -70, 0.25, 28)}
            {v_straight(-70, -22)}
        </PointsPath>
        <Stroke thickness="2.5" cap="round" name="Stroke"><SolidColor colorValue="FF241D19" name="C"/></Stroke>
    </Shape>
    <Shape name="Body" id="0:61">
        <PointsPath isClosed="true" name="Path">
            {v_straight(-188, 0, 18)}
            {v_cubic(-214, -48, -1.3, 26)}
            {v_cubic(-148, -114, -0.22, 42)}
            {v_cubic(-30, -104, 0.06, 45)}
            {v_cubic(108, -114, 0.1, 40)}
            {v_cubic(214, -46, 1.38, 34)}
            {v_straight(212, 0, 10)}
        </PointsPath>
        <Fill name="Fill"><SolidColor colorValue="{BLACK}" name="C"/></Fill>
        {soft_edge()}
        {rim_stroke(0, -60, 25, -125, "0:62", fade_from=0.5)}
    </Shape>
</Node>
"""

# Tail: an open path stroked thick; its lower vertices are keyframed.
TAIL_REST = [(0, 0, 2.75, 18), (-34, 24, 1.95, 20), (-36, 74, 1.45, 22), (0, 116, 0.55, 12)]
TAIL_IDS = ["0:71", "0:72", "0:73", "0:74"]
tail_vertices = "\n".join(
    v_cubic(x, y, r, d, vid=TAIL_IDS[i]) for i, (x, y, r, d) in enumerate(TAIL_REST)
)
tail = f"""
<Shape x="76" y="272" name="Tail" id="0:70">
    <PointsPath isClosed="false" name="Path">
        {tail_vertices}
    </PointsPath>
    <Stroke thickness="23" cap="round" join="round" name="Stroke"><SolidColor colorValue="{BLACK}" name="C"/></Stroke>
</Shape>
"""

shadow = """
<Shape x="268" y="292" name="ContactShadow">
    <Ellipse width="450" height="22" originX="0.5" originY="0.5" name="Path"/>
    <Fill fillRule="clockwise" name="Fill">
        <SolidColor colorValue="99000000" name="C"/>
        <Feather strength="9" name="F"/>
    </Fill>
</Shape>
"""

# ---------------------------------------------------------------- animation


def ease(x1=0.42, y1=0, x2=0.58, y2=1):
    return f'<CubicEaseInterpolator x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/>'


def kf(frame, value, interp="cubic"):
    if interp == "cubic":
        return f'<KeyFrameDouble frame="{frame}" value="{value}" interpolationType="cubic">{ease()}</KeyFrameDouble>'
    return f'<KeyFrameDouble frame="{frame}" value="{value}" interpolationType="{interp}"/>'


def keyed(obj, prop, frames):
    keys = "\n".join(kf(*f) for f in frames)
    return f"""
        <KeyedObject objectId="{obj}">
            <KeyedProperty property="{prop}">
                {keys}
            </KeyedProperty>
        </KeyedObject>"""


def color_keyed(obj, color):
    return f"""
        <KeyedObject objectId="{obj}">
            <KeyedProperty property="colorValue">
                <KeyFrameColor frame="0" value="{color}" interpolationType="hold"/>
            </KeyedProperty>
        </KeyedObject>"""


def lids(open_y, closed_y, frames):
    """frames: list of (frame, 'open'|'closed', interp)."""
    out = ""
    for lid in ("0:21", "0:31"):
        out += keyed(lid, "y", [(f, open_y if s == "open" else closed_y, i) for f, s, i in frames])
    return out


def lashes(frames):
    out = ""
    for lash in ("0:22", "0:32"):
        out += keyed(lash, "opacity", frames)
    return out


LID_OPEN, LID_CLOSED = -4, 13

breathe = f"""
<LinearAnimation loopValue="loop" duration="240" name="Breathe" id="0:200">
    {keyed("0:60", "scaleY", [(0, 1), (110, 1.028), (240, 1)])}
    {keyed("0:10", "y", [(0, 192), (110, 189), (240, 192)])}
</LinearAnimation>
"""

# Tail poses: rest, swing right, rest, swing left, rest; plus a small tip flick.
POSE_B = [None, (-28, 28, 1.8), (-18, 76, 1.2), (22, 108, 0.15)]
POSE_C = [None, (-40, 20, 2.1), (-52, 70, 1.75), (-34, 114, 1.15)]
POSE_FLICK = [None, (-34, 24, 1.95), (-34, 72, 1.3), (16, 100, -0.5)]
tail_keys = ""
for i in (1, 2, 3):
    rest = TAIL_REST[i][:3]
    seq = [(0, rest), (100, POSE_B[i]), (190, rest), (290, POSE_C[i]), (380, rest), (410, POSE_FLICK[i]), (440, rest)]
    for k, prop in enumerate(("x", "y", "rotation")):
        tail_keys += keyed(TAIL_IDS[i], prop, [(f, p[k]) for f, p in seq])
tail_anim = f"""
<LinearAnimation loopValue="loop" duration="440" name="TailSway" id="0:201">
    {tail_keys}
</LinearAnimation>
"""

ear_anim = f"""
<LinearAnimation loopValue="loop" duration="420" name="EarTwitch" id="0:202">
    {keyed("0:14", "rotation", [(0, 0.28, "hold"), (380, 0.28), (384, 0.46), (389, 0.28), (394, 0.46), (400, 0.28), (420, 0.28, "hold")])}
</LinearAnimation>
"""

awake = f"""
<LinearAnimation loopValue="loop" duration="300" name="Awake" id="0:203">
    {lids(LID_OPEN, LID_CLOSED, [(0, "open", "hold"), (262, "open", "cubic"), (267, "closed", "cubic"), (273, "open", "hold"), (300, "open", "hold")])}
    {lashes([(0, 0, "hold")])}
    {keyed("0:15", "x", [(0, 0, "hold")])}
    {keyed("0:15", "y", [(0, 0, "hold")])}
    {keyed("0:15", "rotation", [(0, 0, "hold")])}
    {keyed("0:13", "rotation", [(0, -0.3, "hold")])}
</LinearAnimation>
"""

asleep = f"""
<LinearAnimation loopValue="loop" duration="60" name="Asleep" id="0:204">
    {lids(LID_OPEN, LID_CLOSED, [(0, "closed", "hold")])}
    {lashes([(0, 1, "hold")])}
    {keyed("0:15", "x", [(0, 12, "hold")])}
    {keyed("0:15", "y", [(0, 27, "hold")])}
    {keyed("0:15", "rotation", [(0, 0.1, "hold")])}
    {keyed("0:13", "rotation", [(0, -0.48, "hold")])}
    {keyed("0:14", "rotation", [(0, 0.5, "hold")])}
</LinearAnimation>
"""

pet = f"""
<LinearAnimation duration="110" name="Pet" id="0:205">
    {lids(LID_OPEN, LID_CLOSED, [(0, "open", "cubic"), (8, "closed", "hold"), (96, "closed", "cubic"), (106, "open", "hold")])}
    {lashes([(0, 0, "cubic"), (8, 1, "hold"), (96, 1, "cubic"), (104, 0, "hold")])}
    {keyed("0:15", "rotation", [(0, 0), (22, 0.08), (40, 0.05), (60, 0.08), (96, 0.08), (110, 0)])}
    {keyed("0:13", "rotation", [(0, -0.3), (14, -0.5), (90, -0.5), (108, -0.3)])}
</LinearAnimation>
"""

lamp_on = f"""
<LinearAnimation duration="1" name="LampOnLook" id="0:206">
    {color_keyed("0:12", WARM_RIM)}{color_keyed("0:52", WARM_RIM)}{color_keyed("0:62", WARM_RIM)}
</LinearAnimation>
"""
lamp_off = f"""
<LinearAnimation duration="1" name="LampOffLook" id="0:207">
    {color_keyed("0:12", COOL_RIM)}{color_keyed("0:52", COOL_RIM)}{color_keyed("0:62", COOL_RIM)}
</LinearAnimation>
"""


def bool_cond(value):
    return f'<TransitionBoolCondition inputId="0:101" opValue="{"equal" if value else "notEqual"}"/>'


def layer(lid, name, entry_to, states):
    return f"""
    <StateMachineLayer name="{name}" id="{lid}">
        <AnyState x="0" y="-120"/>
        <ExitState x="600" y="-120"/>
        <EntryState x="0" y="0"><StateTransition stateToId="{entry_to}"/></EntryState>
        {states}
    </StateMachineLayer>"""


machine = f"""
<StateMachine name="Cat" id="0:100">
    <StateMachineBool name="lampOn" value="{LAMP_DEFAULT}" id="0:101"/>
    <StateMachineTrigger name="pet" id="0:102"/>
    <StateMachineListenerSingle targetId="0:61" listenerTypeValue="click" name="PetBody">
        <ListenerTriggerChange inputId="0:102"/>
    </StateMachineListenerSingle>
    <StateMachineListenerSingle targetId="0:11" listenerTypeValue="click" name="PetHead">
        <ListenerTriggerChange inputId="0:102"/>
    </StateMachineListenerSingle>
    {layer("0:110", "Breathe", "0:111", '<AnimationState x="200" y="0" animationId="0:200" id="0:111"/>')}
    {layer("0:120", "Tail", "0:121", '<AnimationState x="200" y="0" animationId="0:201" id="0:121"/>')}
    {layer("0:130", "Ears", "0:131", '<AnimationState x="200" y="0" animationId="0:202" id="0:131"/>')}
    {layer("0:140", "Eyes", "0:141", f'''
        <AnimationState x="200" y="0" animationId="0:203" id="0:141">
            <StateTransition stateToId="0:142" duration="1100">{bool_cond(False)}</StateTransition>
            <StateTransition stateToId="0:143" duration="80"><TransitionTriggerCondition inputId="0:102"/></StateTransition>
        </AnimationState>
        <AnimationState x="400" y="0" animationId="0:204" id="0:142">
            <StateTransition stateToId="0:141" duration="450">{bool_cond(True)}</StateTransition>
            <StateTransition stateToId="0:143" duration="80"><TransitionTriggerCondition inputId="0:102"/></StateTransition>
        </AnimationState>
        <AnimationState x="300" y="160" animationId="0:205" reset="true" id="0:143">
            <StateTransition stateToId="0:141" duration="250" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100">{bool_cond(True)}</StateTransition>
            <StateTransition stateToId="0:142" duration="400" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100">{bool_cond(False)}</StateTransition>
        </AnimationState>''')}
    {layer("0:150", "Light", "0:151", f'''
        <AnimationState x="200" y="0" animationId="0:206" id="0:151">
            <StateTransition stateToId="0:152" duration="600">{bool_cond(False)}</StateTransition>
        </AnimationState>
        <AnimationState x="400" y="0" animationId="0:207" id="0:152">
            <StateTransition stateToId="0:151" duration="600">{bool_cond(True)}</StateTransition>
        </AnimationState>''')}
</StateMachine>
"""

# Draw order: the first declared element paints on top.
scene = f"""<Rive version="1" kind="fragment">
<Artboard defaultStateMachineId="0:100" styleId="0:2" width="600" height="480" name="Cat" id="0:1">
    <LayoutComponentStyle name="Artboard Style" id="0:2"/>
    {machine}
    {head}
    {torso}
    {paws}
    {tail}
    {shadow}
    {breathe}
    {tail_anim}
    {ear_anim}
    {awake}
    {asleep}
    {pet}
    {lamp_on}
    {lamp_off}
</Artboard>
</Rive>
"""

with open("scene.rml", "w") as f:
    f.write(scene)
print("wrote scene.rml")
